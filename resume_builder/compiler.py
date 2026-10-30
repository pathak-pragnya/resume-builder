"""Run pdfLaTeX / XeLaTeX on generated sources and parse the results."""

from __future__ import annotations

import base64
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

ENGINES = ("xelatex", "pdflatex")
JOB_NAME = "resume"

_TEX_DIRS = (
    "/Library/TeX/texbin",
    "/usr/texbin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
)

_MAGIC_RE = re.compile(r"^%\s*!TEX\s+(?:TS-)?program\s*=\s*(\w+)", re.I | re.M)
_FILE_ERROR_RE = re.compile(r"^(?:\./)?[^\s:]+\.tex:(\d+): (.+)$")
_BANG_RE = re.compile(r"^! (.+)$")
_CONTEXT_RE = re.compile(r"^l\.(\d+) (.*)$")
_BOX_RE = re.compile(
    r"^(Overfull|Underfull) \\([hv])box \(([^)]*)\)"
    r"(?:.*?at lines? (\d+)(?:--(\d+))?)?"
)
_MISSING_CHAR_RE = re.compile(r"^Missing character: There is no (.+?) in font (.+?)!")
_STATS_RE = re.compile(r"^RBSTATS pages=(\d+) remaining=(-?[\d.]+)pt", re.M)
_NOISE = ("Emergency stop", "==> Fatal error occurred", "Fatal error occurred")


def find_program(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    for directory in _TEX_DIRS:
        candidate = Path(directory) / name
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    for candidate in sorted(Path("/usr/local/texlive").glob(f"*/bin/*/{name}"), reverse=True):
        if os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def detect_engine(tex: str) -> str | None:
    match = _MAGIC_RE.search(tex[:2000])
    if match and match.group(1).lower() in ENGINES:
        return match.group(1).lower()
    return None


def parse_log(log: str) -> tuple[list[dict], list[dict]]:
    errors: list[dict] = []
    warnings: list[dict] = []
    lines = log.splitlines()
    for index, line in enumerate(lines):
        message, line_no = None, None
        file_match = _FILE_ERROR_RE.match(line)
        if file_match:
            line_no, message = int(file_match.group(1)), file_match.group(2)
        else:
            bang = _BANG_RE.match(line)
            if bang:
                message = bang.group(1)
        if message:
            if any(noise in message for noise in _NOISE):
                continue
            context = ""
            for follow in lines[index + 1:index + 12]:
                ctx = _CONTEXT_RE.match(follow)
                if ctx:
                    line_no = line_no or int(ctx.group(1))
                    context = ctx.group(2).strip()
                    break
            if not any(e["message"] == message and e["line"] == line_no for e in errors):
                errors.append({"line": line_no, "message": message.strip(), "context": context})
            continue
        box = _BOX_RE.match(line)
        if box:
            kind, axis, amount, start = box.group(1), box.group(2), box.group(3), box.group(4)
            if kind == "Underfull" and "badness 10000" not in amount:
                continue
            warnings.append({
                "line": int(start) if start else None,
                "message": f"{kind} \\{axis}box ({amount})",
                "kind": "overfull" if kind == "Overfull" else "underfull",
            })
            continue
        missing = _MISSING_CHAR_RE.match(line)
        if missing:
            warnings.append({
                "line": None,
                "message": f"Missing character {missing.group(1)} in font {missing.group(2)}",
                "kind": "font",
            })
    if not errors and "Fatal error occurred" in log:
        errors.append({"line": None, "message": "TeX stopped with a fatal error (see log).", "context": ""})
    return errors[:20], warnings[:100]


def parse_stats(log: str) -> dict | None:
    match = _STATS_RE.search(log)
    if not match:
        return None
    remaining = float(match.group(2))
    return {
        "pages": int(match.group(1)),
        "remainingPt": None if remaining > 16000 else remaining,
    }


def tex_environment(executable: str) -> dict:
    env = os.environ.copy()
    env["PATH"] = os.path.dirname(executable) + os.pathsep + env.get("PATH", "")
    env["max_print_line"] = "10000"
    env["error_line"] = "254"
    env["half_error_line"] = "238"
    return env


def run_engine(executable: str, workdir: Path, source: str, timeout: float) -> tuple[int, str]:
    cmd = [
        executable,
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-file-line-error",
        "-no-shell-escape",
        source,
    ]
    proc = subprocess.run(
        cmd,
        cwd=workdir,
        env=tex_environment(executable),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )
    return proc.returncode, proc.stdout.decode("utf-8", errors="replace")


@dataclass
class CompileResult:
    ok: bool
    engine: str
    log: str = ""
    pdf: bytes | None = None
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    stats: dict | None = None
    duration_ms: int = 0

    def to_json(self) -> dict:
        return {
            "ok": self.ok,
            "engine": self.engine,
            "log": self.log,
            "pdf": base64.b64encode(self.pdf).decode("ascii") if self.pdf else None,
            "errors": self.errors,
            "warnings": self.warnings,
            "stats": self.stats,
            "durationMs": self.duration_ms,
        }


def _atomic_write(path: Path, data: bytes) -> None:
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex[:8]}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


class Compiler:
    def __init__(self, output_dir: Path, timeout: float = 60.0):
        self.output_dir = Path(output_dir)
        self.build_root = self.output_dir / ".build"
        self.timeout = timeout
        self.engines = {name: find_program(name) for name in ENGINES}
        self._lock = threading.Lock()

    def available(self) -> dict:
        return {name: bool(path) for name, path in self.engines.items()}

    def scratch_dir(self, prefix: str) -> Path:
        path = self.build_root / f"{prefix}-{uuid.uuid4().hex[:10]}"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def compile(self, tex: str, engine: str) -> CompileResult:
        executable = self.engines.get(engine)
        if not executable:
            return CompileResult(
                ok=False,
                engine=engine,
                errors=[{"line": None, "message": f"{engine} was not found on this machine.", "context": ""}],
            )
        with self._lock:
            self.output_dir.mkdir(parents=True, exist_ok=True)
            workdir = self.scratch_dir("job")
            started = time.monotonic()
            try:
                (workdir / f"{JOB_NAME}.tex").write_text(tex, encoding="utf-8")
                try:
                    code, stdout = run_engine(executable, workdir, f"{JOB_NAME}.tex", self.timeout)
                except subprocess.TimeoutExpired:
                    code, stdout = -1, f"Compilation timed out after {self.timeout:.0f}s."
                log_path = workdir / f"{JOB_NAME}.log"
                log = log_path.read_text(encoding="utf-8", errors="replace") if log_path.exists() else stdout
                pdf_path = workdir / f"{JOB_NAME}.pdf"
                ok = code == 0 and pdf_path.exists()
                pdf = pdf_path.read_bytes() if ok else None

                _atomic_write(self.output_dir / f"{JOB_NAME}.tex", tex.encode("utf-8"))
                _atomic_write(self.output_dir / f"{JOB_NAME}.log", log.encode("utf-8"))
                if pdf:
                    _atomic_write(self.output_dir / f"{JOB_NAME}.pdf", pdf)

                errors, warnings = parse_log(log)
                if not ok and not errors:
                    tail = stdout.strip().splitlines()[-1:] or ["Unknown error"]
                    errors = [{"line": None, "message": tail[0], "context": ""}]
                return CompileResult(
                    ok=ok,
                    engine=engine,
                    log=log,
                    pdf=pdf,
                    errors=[] if ok else errors,
                    warnings=warnings,
                    stats=parse_stats(log),
                    duration_ms=int((time.monotonic() - started) * 1000),
                )
            finally:
                shutil.rmtree(workdir, ignore_errors=True)

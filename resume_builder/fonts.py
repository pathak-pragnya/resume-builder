"""Detect which fonts the local TeX installation can actually use."""

from __future__ import annotations

import json
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .compiler import Compiler, run_engine

XELATEX_CANDIDATES = (
    "Charter", "Palatino", "Georgia", "Times New Roman", "Baskerville", "Hoefler Text",
    "Iowan Old Style", "Athelas", "Big Caslon", "Cochin", "Didot", "Bodoni 72",
    "PT Serif", "STIX Two Text", "Superclarendon", "Rockwell", "American Typewriter",
    "EB Garamond", "Garamond", "Libertinus Serif", "Source Serif 4", "Crimson Pro", "Merriweather",
    "Helvetica Neue", "Helvetica", "Avenir Next", "Avenir", "Optima", "Gill Sans", "Futura",
    "Seravek", "Arial", "Verdana", "Trebuchet MS", "Tahoma", "Geneva", "Lucida Grande",
    "PT Sans", "Avenir Next Condensed", "Inter", "Roboto", "Lato", "Open Sans", "Source Sans 3",
    "Source Sans Pro", "IBM Plex Sans", "IBM Plex Serif", "Fira Sans", "Montserrat", "Raleway",
    "Calibri", "Cambria", "Latin Modern Roman", "Latin Modern Sans", "TeX Gyre Pagella",
    "TeX Gyre Termes", "TeX Gyre Heros", "Menlo", "SF Mono", "Courier New",
)

PDFLATEX_CANDIDATES = (
    ("lmr", "Latin Modern Roman"),
    ("lmss", "Latin Modern Sans"),
    ("ptm", "Times"),
    ("phv", "Helvetica"),
    ("ppl", "Palatino"),
    ("bch", "Charter"),
    ("pbk", "Bookman"),
    ("pag", "Avant Garde"),
    ("pnc", "New Century Schoolbook"),
    ("put", "Utopia"),
    ("qpl", "TeX Gyre Pagella"),
    ("qtm", "TeX Gyre Termes"),
    ("qhv", "TeX Gyre Heros"),
    ("Libertine-OsF", "Linux Libertine"),
)

CACHE_TTL = 12 * 3600


class FontCatalog:
    def __init__(self, compiler: Compiler, cache_dir: Path):
        self.compiler = compiler
        self.cache_file = Path(cache_dir) / "fonts.json"
        self._ready = threading.Event()
        self._data: dict = {"xelatex": [], "pdflatex": []}

    def start(self) -> None:
        threading.Thread(target=self._detect, name="font-detect", daemon=True).start()

    def snapshot(self, wait: float = 20.0) -> dict:
        self._ready.wait(wait)
        return {"ready": self._ready.is_set(), **self._data}

    def _cache_key(self) -> dict:
        return {name: path for name, path in self.compiler.engines.items()}

    def _detect(self) -> None:
        try:
            cached = self._load_cache()
            if cached is not None:
                self._data = cached
                return
            data = {"xelatex": self._detect_xelatex(), "pdflatex": self._detect_pdflatex()}
            self._data = data
            self._save_cache(data)
        except Exception as exc:  # detection is best-effort; the UI still accepts typed font names
            print(f"[fonts] detection failed: {exc}")
        finally:
            self._ready.set()

    def _load_cache(self) -> dict | None:
        try:
            payload = json.loads(self.cache_file.read_text())
        except (OSError, ValueError):
            return None
        if payload.get("key") != self._cache_key() or time.time() - payload.get("time", 0) > CACHE_TTL:
            return None
        return payload.get("data")

    def _save_cache(self, data: dict) -> None:
        self.cache_file.parent.mkdir(parents=True, exist_ok=True)
        self.cache_file.write_text(json.dumps({"key": self._cache_key(), "time": time.time(), "data": data}))

    def _detect_xelatex(self) -> list[str]:
        executable = self.compiler.engines.get("xelatex")
        if not executable:
            return []
        checks = "\n".join(
            rf"\IfFontExistsTF{{{name}}}{{\typeout{{RBFONT|{name}|1}}}}{{\typeout{{RBFONT|{name}|0}}}}"
            for name in XELATEX_CANDIDATES
        )
        source = "\\documentclass{article}\n\\usepackage{fontspec}\n\\begin{document}\n" + checks + "\nx\n\\end{document}\n"
        workdir = self.compiler.scratch_dir("fonts-xe")
        try:
            (workdir / "probe.tex").write_text(source, encoding="utf-8")
            _, stdout = run_engine(executable, workdir, "probe.tex", timeout=180)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
        found = []
        for line in stdout.splitlines():
            if line.startswith("RBFONT|"):
                _, name, flag = line.strip().split("|")
                if flag == "1":
                    found.append(name)
        return found

    def _detect_pdflatex(self) -> list[dict]:
        executable = self.compiler.engines.get("pdflatex")
        if not executable:
            return []

        def probe(candidate: tuple[str, str]) -> dict | None:
            family, label = candidate
            source = (
                "\\documentclass{article}\\usepackage[T1]{fontenc}"
                f"\\renewcommand{{\\familydefault}}{{{family}}}"
                "\\begin{document}Hello \\textbf{bold} \\textit{italic}\\end{document}\n"
            )
            workdir = self.compiler.scratch_dir("fonts-pdf")
            try:
                (workdir / "probe.tex").write_text(source, encoding="utf-8")
                code, stdout = run_engine(executable, workdir, "probe.tex", timeout=60)
            except Exception:
                return None
            finally:
                shutil.rmtree(workdir, ignore_errors=True)
            if code != 0 or ("Font shape" in stdout and "undefined" in stdout):
                return None
            return {"id": family, "label": label}

        with ThreadPoolExecutor(max_workers=4) as pool:
            return [result for result in pool.map(probe, PDFLATEX_CANDIDATES) if result]

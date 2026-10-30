#!/usr/bin/env python3
"""LaTeX Resume Builder: local web UI and compile server (standard library only).

    python3 server.py                 # http://127.0.0.1:8000
    python3 server.py --port 9000 --open
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import traceback
import uuid
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from resume_builder.compiler import Compiler, detect_engine
from resume_builder.defaults import DEFAULT_LAYOUT, SAMPLE_RESUME
from resume_builder.fonts import FontCatalog
from resume_builder.latex import engine_for, generate_latex

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
OUTPUT_DIR = ROOT / "output"
MAX_BODY_BYTES = 16 * 1024 * 1024

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}

OUTPUT_FILES = {
    "resume.tex": "text/plain; charset=utf-8",
    "resume.pdf": "application/pdf",
    "resume.log": "text/plain; charset=utf-8",
    "resume.json": "application/json; charset=utf-8",
}


class ApiError(Exception):
    def __init__(self, status: HTTPStatus, message: str):
        super().__init__(message)
        self.status = status


class ResumeApp:
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.compiler = Compiler(output_dir)
        self.fonts = FontCatalog(self.compiler, output_dir / ".cache")
        self.fonts.start()
        self._save_lock = threading.Lock()

    @property
    def resume_path(self) -> Path:
        return self.output_dir / "resume.json"

    def config(self) -> dict:
        return {
            "engines": self.compiler.available(),
            "fonts": self.fonts.snapshot(),
            "defaults": {"layout": DEFAULT_LAYOUT, "resume": SAMPLE_RESUME},
            "outputDir": str(self.output_dir),
            "files": sorted(OUTPUT_FILES),
        }

    def load_resume(self) -> dict:
        try:
            data = json.loads(self.resume_path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("sections"), list):
                return {"resume": data, "source": "saved"}
        except (OSError, ValueError):
            pass
        return {"resume": SAMPLE_RESUME, "source": "sample"}

    def save_resume(self, resume: dict) -> None:
        payload = json.dumps(resume, indent=2, ensure_ascii=False).encode("utf-8")
        with self._save_lock:
            tmp = self.resume_path.with_name(f".resume.json.{uuid.uuid4().hex[:8]}.tmp")
            tmp.write_bytes(payload)
            os.replace(tmp, self.resume_path)

    def compile(self, payload: dict) -> dict:
        tex = payload.get("tex")
        resume = payload.get("resume")
        if isinstance(tex, str) and tex.strip():
            engine = payload.get("engine") or detect_engine(tex) or "xelatex"
            source = "manual"
        elif isinstance(resume, dict):
            tex = generate_latex(resume)
            engine = engine_for(resume)
            source = "generated"
            self.save_resume(resume)
        else:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Send either 'resume' (object) or 'tex' (string).")
        if engine not in self.compiler.engines:
            raise ApiError(HTTPStatus.BAD_REQUEST, f"Unsupported engine: {engine}")
        result = self.compiler.compile(tex, engine)
        return {**result.to_json(), "tex": tex, "source": source}


class Handler(BaseHTTPRequestHandler):
    server_version = "ResumeBuilder/1.0"
    app: ResumeApp

    # ---- plumbing

    def log_message(self, fmt: str, *args) -> None:
        if self.path.startswith("/static/"):
            return
        sys.stderr.write(f"[{self.log_date_time_string()}] {fmt % args}\n")

    def send_bytes(self, status: int, body: bytes, content_type: str, headers: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, data: dict, status: int = HTTPStatus.OK) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_bytes(status, body, "application/json; charset=utf-8")

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:
            raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Request body too large.")
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except ValueError as exc:
            raise ApiError(HTTPStatus.BAD_REQUEST, f"Invalid JSON: {exc}") from exc
        if not isinstance(data, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, "Expected a JSON object.")
        return data

    def dispatch(self, routes: dict) -> None:
        url = urlparse(self.path)
        try:
            handler = routes.get(url.path)
            if handler:
                handler(url)
            elif self.command in ("GET", "HEAD") and url.path.startswith("/static/"):
                self.serve_static(unquote(url.path[len("/static/"):]))
            elif self.command in ("GET", "HEAD") and url.path.startswith("/files/"):
                self.serve_output(unquote(url.path[len("/files/"):]), parse_qs(url.query))
            else:
                raise ApiError(HTTPStatus.NOT_FOUND, f"Not found: {url.path}")
        except ApiError as exc:
            self.send_json({"error": str(exc)}, exc.status)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            traceback.print_exc()
            self.send_json({"error": f"{type(exc).__name__}: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    # ---- routes

    def do_GET(self) -> None:
        self.dispatch({
            "/": lambda _: self.serve_static("index.html"),
            "/api/config": lambda _: self.send_json(self.app.config()),
            "/api/resume": lambda _: self.send_json(self.app.load_resume()),
        })

    do_HEAD = do_GET

    def do_PUT(self) -> None:
        def save(_):
            resume = self.read_json().get("resume")
            if not isinstance(resume, dict):
                raise ApiError(HTTPStatus.BAD_REQUEST, "Missing 'resume' object.")
            self.app.save_resume(resume)
            self.send_json({"ok": True})

        self.dispatch({"/api/resume": save})

    def do_POST(self) -> None:
        def generate(_):
            resume = self.read_json().get("resume")
            if not isinstance(resume, dict):
                raise ApiError(HTTPStatus.BAD_REQUEST, "Missing 'resume' object.")
            self.send_json({"tex": generate_latex(resume), "engine": engine_for(resume)})

        def compile_(_):
            result = self.app.compile(self.read_json())
            self.send_json(result, HTTPStatus.OK if result["ok"] else HTTPStatus.UNPROCESSABLE_ENTITY)

        self.dispatch({"/api/generate": generate, "/api/compile": compile_})

    # ---- files

    def serve_static(self, relative: str) -> None:
        path = (STATIC_DIR / relative).resolve()
        if STATIC_DIR not in path.parents or not path.is_file():
            raise ApiError(HTTPStatus.NOT_FOUND, f"Not found: {relative}")
        content_type = CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")
        self.send_bytes(HTTPStatus.OK, path.read_bytes(), content_type)

    def serve_output(self, name: str, query: dict) -> None:
        if name not in OUTPUT_FILES:
            raise ApiError(HTTPStatus.NOT_FOUND, f"Unknown file: {name}")
        path = self.app.output_dir / name
        if not path.is_file():
            raise ApiError(HTTPStatus.NOT_FOUND, f"{name} has not been generated yet. Compile first.")
        disposition = "attachment" if query.get("download") else "inline"
        self.send_bytes(
            HTTPStatus.OK,
            path.read_bytes(),
            OUTPUT_FILES[name],
            {"Content-Disposition": f'{disposition}; filename="{name}"'},
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    parser.add_argument("--open", action="store_true", help="open the UI in your browser")
    args = parser.parse_args()

    app = ResumeApp(OUTPUT_DIR)
    missing = [name for name, ok in app.compiler.available().items() if not ok]
    if len(missing) == len(app.compiler.engines):
        print("warning: neither xelatex nor pdflatex was found; install MacTeX/BasicTeX or TeX Live.")
    elif missing:
        print(f"note: {', '.join(missing)} not found; that engine will be unavailable.")

    Handler.app = app
    try:
        server = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as exc:
        raise SystemExit(f"error: cannot listen on {args.host}:{args.port} ({exc.strerror}). "
                         f"Try another port, e.g. --port {args.port + 1}.")
    url = f"http://{args.host}:{args.port}/"
    print(f"LaTeX Resume Builder running at {url}")
    print(f"Generated files: {OUTPUT_DIR}/resume.tex, resume.pdf, resume.log, resume.json")
    if args.open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build resume.tex and resume.pdf from a resume JSON file without the UI.

    python3 build_resume.py                       # uses output/resume.json (or the sample)
    python3 build_resume.py my_resume.json -o out/
    python3 build_resume.py --tex-only            # write the .tex, skip compiling
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

from resume_builder.compiler import Compiler
from resume_builder.defaults import SAMPLE_RESUME
from resume_builder.latex import engine_for, generate_latex

ROOT = Path(__file__).resolve().parent
SAVED_RESUME = ROOT / "output" / "resume.json"


def load_resume(path: str | None) -> dict:
    if path is None:
        if not SAVED_RESUME.is_file():
            print(f"note: {SAVED_RESUME} not found; building the sample resume.")
            return copy.deepcopy(SAMPLE_RESUME)
        path = str(SAVED_RESUME)
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"error: {path} not found")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"error: {path} is not valid JSON ({exc})")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", nargs="?", help="resume JSON (default: output/resume.json)")
    parser.add_argument("-o", "--output-dir", default=str(ROOT / "output"))
    parser.add_argument("--tex-only", action="store_true")
    args = parser.parse_args()

    resume = load_resume(args.input)
    tex = generate_latex(resume)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.tex_only:
        (out_dir / "resume.tex").write_text(tex, encoding="utf-8")
        print(f"wrote {out_dir / 'resume.tex'}")
        return 0

    result = Compiler(out_dir).compile(tex, engine_for(resume))
    if not result.ok:
        for error in result.errors:
            where = f"line {error['line']}: " if error.get("line") else ""
            print(f"error: {where}{error['message']}", file=sys.stderr)
        print(f"see {out_dir / 'resume.log'}", file=sys.stderr)
        return 1
    pages = (result.stats or {}).get("pages", "?")
    print(f"wrote {out_dir / 'resume.tex'} and {out_dir / 'resume.pdf'} ({pages} page(s), {result.duration_ms} ms)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

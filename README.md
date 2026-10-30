# LaTeX Resume Builder

A local web app for building a resume in LaTeX. You fill in your content in a
form, tune every size and spacing value in the Design tab (globally or per
section and per entry), and see the compiled PDF update next to it. The
generated LaTeX source, the PDF, and the compile log are written to the
`output/` folder so you can always grab or edit them directly.

Everything runs on your machine. There is nothing to `pip install` or
`npm install`: the server uses only the Python standard library, and the
browser libraries are bundled in `static/vendor/`.

---

## Requirements

1. **Python 3.9 or newer.** Check with `python3 --version`.
2. **A TeX distribution** that provides `xelatex` and/or `pdflatex`:
   - **macOS:** [MacTeX](https://www.tug.org/mactex/) (full) or BasicTeX
     (small, ~100 MB; `brew install --cask basictex`). BasicTeX already
     includes every package this app needs.
   - **Linux:** TeX Live, for example
     `sudo apt install texlive-xetex texlive-latex-extra` (or `texlive-full`).
   - **Windows:** MiKTeX or TeX Live (should work, but untested).
3. **A recent browser** (Chrome, Edge, Safari or Firefox).

The generated documents use these LaTeX packages: `geometry`, `fontspec`
(XeLaTeX only), `xcolor`, `hyperref`, `microtype`, `multicol`, `ragged2e`,
`graphicx`, `ulem`, `fix-cm` and `lm`. If your TeX install is missing one, install it
with `sudo tlmgr install <package>`.

This tool was tested on macOS with BasicTeX 2024 and Python 3.9 and 3.11.

---

## Quick start

```bash
cd latex-resume-builder
python3 server.py
```

Then open **http://127.0.0.1:8000** in your browser. A sample resume loads
and compiles automatically. Stop the server with `Ctrl+C`.

Server options:

| Option | What it does |
| --- | --- |
| `--port 9000` | Use a different port (or set the `PORT` environment variable). |
| `--open` | Open the app in your default browser on start. |
| `--host 127.0.0.1` | Address to listen on. Keep the default: the server has no login and is meant for local use only. |

On the first start the server detects which fonts are available. This runs
in the background (usually a few seconds, up to about 20 on a brand-new TeX
install) and is cached in `output/.cache/` for 12 hours.

> Open the app through the server URL. Opening `static/index.html` directly
> as a file won't work, because the browser blocks its modules over `file://`.

---

## Using the app

The left side has three tabs. The right side is the live PDF preview.

### Content tab
- **Header:** name, headline, and contact items. Emails and web addresses
  become links automatically, or you can give an item its own link. Use the
  ↵ button on an item to start a new contact line before it.
- **Sections:** add them from the tiles at the bottom:
  - *Entries* for experience, education and projects (title, subtitle, date, location, link, description, bullets)
  - *Skills table* for label → value rows
  - *Paragraph* for a summary or objective
  - *List* for bullets, inline items or columns
  - *Raw LaTeX* for anything custom
- Each section can be moved, hidden from the PDF, duplicated or deleted.
- **Project subsections:** use **Add subsection** in an entry-based section,
  name it (for example, “Processor Design (CPU)”), and drag entries by their
  grip into it. Drag between entries to reorder, or use the Subsection dropdown
  inside an entry. Subsection headings appear in the PDF using the section's
  heading color. Removing a subsection keeps its entries under Ungrouped.
  Drag a subsection's own grip, or use its up/down arrows, to reorder entire
  subsections and the Ungrouped block. The PDF follows the same order.
- Switching section type carries compatible content and settings into a blank
  form. Existing entries keep their fields and settings; missing entries are
  carried over into blank rows or appended. Other populated forms are restored
  unchanged. Section titles stay independent of the selected type.
- **Bullets:** press `Enter` to split a bullet, and `Backspace` in an empty
  bullet to remove it. Select text and use **B**, **I**, **U**, or
  `⌘/Ctrl+B`, `⌘/Ctrl+I`, `⌘/Ctrl+U` to toggle bold, italic, or underline.
- **Per-section and per-entry overrides:** open "Section spacing & layout"
  on a section, or "Fine-tune this entry" on an entry. Empty fields inherit
  the Design tab value, which is shown in grey. Negative values tighten
  spacing.

Text fields support a little formatting: `**bold**`, `*italic*`, `__underline__`,
`` `code` ``, `[label](https://link)`, and `--` for an en dash (–).

### Design tab
Global settings for the page (paper size, margins, page numbers),
typography (engine, fonts, size, line height, alignment), colours (with
preset palettes), header, section headings and rules, entries, bullet
lists, skills tables, links, and an Advanced group for extra preamble
code.

Every length field has a unit selector (pt, mm, cm, in); changing the unit
converts the value. To adjust a number precisely:
- press `↑` / `↓` in the field (hold `Shift` for ×10 steps, `Alt` for ÷10), or
- drag the field's label left and right.

### LaTeX tab
- **Generated:** a read-only view of the exact `.tex` being compiled. Every
  setting from the UI appears as a named `\rb…` length or macro near the
  top, so the file is easy to tweak by hand.
- **Manual edit:** edit the LaTeX directly and compile that instead. Form
  changes don't apply while you're in manual mode. Switch back to
  **Generated** to return to the form-driven version (your manual edits are
  kept in the browser), or press **Reset** to discard them.
- **Problems:** errors and warnings with line numbers. Click one to jump to
  that line. "Show full log" displays the whole TeX log.
- **Backend files:** links to open or download each file in `output/`.

### Preview and top bar
- **Compile** rebuilds the PDF. With **Auto** on, it rebuilds about half a
  second after each change.
- The green badge shows the page count and how much space is left on the
  last page.
- Use the zoom controls, the margin-guides toggle, and "open in a new tab"
  as needed. If a compile fails, the last good PDF stays visible (dimmed)
  with the error shown above it.
- **PDF** and **.tex** download the current files.
- The **⋯** menu has: export or import your resume as JSON, reset the
  design to defaults, and load the sample resume.

Keyboard shortcuts (`Ctrl` instead of `⌘` on Windows and Linux):

| Shortcut | Action |
| --- | --- |
| `⌘S` or `⌘Enter` | Compile now |
| `⌘Z` | Undo (outside text fields) |
| `⇧⌘Z` or `⌘Y` | Redo |

---

## Where your files are

Everything is written to `output/` next to `server.py`:

| File | Contents |
| --- | --- |
| `output/resume.json` | Your resume content and design settings. Saved automatically as you edit. |
| `output/resume.tex` | LaTeX source from the most recent compile. |
| `output/resume.pdf` | The most recent successfully compiled PDF. |
| `output/resume.log` | Full TeX log from the most recent compile. |

While the server is running, these are also available at
`http://127.0.0.1:8000/files/resume.pdf` (add `?download=1` to download).

To back up your resume or move it to another computer, copy
`output/resume.json` (or use **⋯ → Export resume JSON**) and import it
there.

---

## Building from the command line

You can build the PDF without the UI:

```bash
python3 build_resume.py                    # builds output/resume.json (or the sample if it doesn't exist yet)
python3 build_resume.py my_resume.json     # build a specific resume JSON
python3 build_resume.py my_resume.json -o out/   # write resume.tex/.pdf/.log to out/
python3 build_resume.py --tex-only         # only write the .tex, don't compile
```

The script exits with status 1 and prints the LaTeX errors if the compile
fails.

---

## Fonts

- **XeLaTeX (default)** can use any font installed on your computer. Type
  its name as shown in Font Book (macOS) or your system font list. The font
  box suggests the fonts that were detected.
- **pdfLaTeX** can only use fonts installed in TeX itself. BasicTeX ships
  Latin Modern, Latin Modern Sans and Times. For more (Helvetica, Palatino,
  Charter, Utopia, TeX Gyre and others), run:

  ```bash
  sudo tlmgr install collection-fontsrecommended
  ```

  Then delete `output/.cache/fonts.json` and restart the server so it
  detects the new fonts.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `warning: neither xelatex nor pdflatex was found` | Install a TeX distribution (see Requirements). On macOS, open a new terminal after installing BasicTeX so `/Library/TeX/texbin` is on your `PATH`. |
| `error: cannot listen on 127.0.0.1:8000 (Address already in use)` | Another program is using the port. Run `python3 server.py --port 8001`. |
| `LaTeX Error: File 'something.sty' not found` | Install the missing package: `sudo tlmgr install something`. |
| `The font "X" cannot be found` | Check the exact font name in Font Book, or pick one from the suggestions. |
| The page is blank or never loads | Make sure you opened the server URL (not the HTML file) and that the terminal running `server.py` shows no errors. |
| Compiles fail after manual LaTeX edits | Fix the line shown under Problems, or switch back to **Generated**. |

---

## Project layout

```
latex-resume-builder/
├── server.py              # local web server + JSON API (python3 server.py)
├── build_resume.py        # command-line build
├── resume_builder/
│   ├── defaults.py        # default design settings and the sample resume
│   ├── latex.py           # turns resume JSON into LaTeX
│   ├── compiler.py        # runs xelatex/pdflatex and parses the log
│   └── fonts.py           # detects available fonts
├── static/
│   ├── index.html
│   ├── css/app.css
│   ├── js/                # the UI (Preact + htm, no build step)
│   └── vendor/            # bundled third-party libraries
└── output/                # created on first run: resume.json/.tex/.pdf/.log
```

The API used by the UI:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/config` | Available engines, detected fonts, defaults |
| `GET /api/resume` / `PUT /api/resume` | Load / save `output/resume.json` |
| `POST /api/generate` | Resume JSON → LaTeX source |
| `POST /api/compile` | Compile a resume (`{"resume": …}`) or raw LaTeX (`{"tex": …}`) |
| `GET /files/<name>` | Serve `resume.tex`, `.pdf`, `.log` or `.json` |

LaTeX always runs with `-no-shell-escape`, so documents can't run shell
commands.

---

## Third-party code

Bundled in `static/vendor/` so the app works offline:

- [Preact](https://preactjs.com/) 10.29.8 (MIT)
- [htm](https://github.com/developit/htm) 3.1.1 (Apache-2.0)
- [PDF.js](https://mozilla.github.io/pdf.js/) 4.10.38 (Apache-2.0)
- [CodeMirror](https://codemirror.net/5/) 5.65.21 with the sTeX mode (MIT)

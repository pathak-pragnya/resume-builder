"""Render a resume document to LaTeX.

Content follows ``defaults.SAMPLE_RESUME`` and layout follows
``defaults.DEFAULT_LAYOUT``. Every layout value becomes a named length or
macro in the generated preamble, so the ``.tex`` file stays hand-editable.
"""

from __future__ import annotations

import math
import re
from typing import Any

from .defaults import DEFAULT_LAYOUT, ENUMS, NUMBER_RANGES, SECTION_TYPES

LENGTH_RE = re.compile(r"^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(pt|mm|cm|in|bp|pc|em|ex)\s*$")
COLOR_RE = re.compile(r"^\s*#?([0-9a-fA-F]{6})\s*$")
NFSS_FAMILY_RE = re.compile(r"^[A-Za-z0-9]{1,16}$")
FONT_NAME_STRIP_RE = re.compile(r"[^A-Za-z0-9 .\-_]")
SCHEME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.\-]*:")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
DOMAIN_RE = re.compile(r"^(?:https?://)?(?:www\.)?[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}(?:/\S*)?$")
INLINE_RE = re.compile(
    r"\*\*(?P<bold>.+?)\*\*"
    r"|\*(?P<italic>[^*\s](?:[^*]*[^*\s])?)\*"
    r"|`(?P<code>[^`]+)`"
    r"|\[(?P<label>[^\]]+)\]\((?P<url>[^)\s]+)\)"
)

PAPER_SIZES = {
    "letter": ("8.5in", "11in"),
    "a4": ("210mm", "297mm"),
    "legal": ("8.5in", "14in"),
}

BULLET_SYMBOLS = {
    "bullet": r"\textbullet",
    "dash": r"\textendash",
    "emdash": r"\textemdash",
    "square": r"\rule[0.12em]{0.42em}{0.42em}",
    "circle": r"$\circ$",
    "triangle": r"$\triangleright$",
    "arrow": r"$\rightarrow$",
    "chevron": "»",
    "star": r"$\star$",
    "none": "",
}

SECTION_STYLE_SCHEMA = {
    "spaceBefore": ("length",),
    "spaceAfter": ("length",),
    "contentIndent": ("length",),
    "entryGap": ("length",),
    "itemSep": ("length",),
    "listIndent": ("length",),
    "labelWidth": ("length",),
    "rowGap": ("length",),
    "columnGap": ("length",),
    "extraSpaceAfter": ("length",),
    "bodySize": ("number", 4.0, 40.0),
    "columns": ("number", 1, 6),
    "pageBreakBefore": ("bool",),
    "listStyle": ("enum", ("bullets", "inline")),
}

ENTRY_STYLE_SCHEMA = {
    "spaceBefore": ("length",),
    "spaceAfter": ("length",),
    "itemSep": ("length",),
    "pageBreakBefore": ("bool",),
}

# Section style key -> LaTeX length it overrides inside the section group.
SECTION_LENGTH_OVERRIDES = {
    "spaceAfter": "rbSectionSpaceAfter",
    "contentIndent": "rbContentIndent",
    "entryGap": "rbEntryGap",
    "itemSep": "rbListItemSep",
    "listIndent": "rbListIndent",
    "labelWidth": "rbSkillLabelWidth",
    "rowGap": "rbSkillRowGap",
    "columnGap": "rbListColumnGap",
}

_SPECIALS = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


# ---------------------------------------------------------------- helpers

def fmt(value: float) -> str:
    text = f"{value:.4f}".rstrip("0").rstrip(".")
    return "0" if text in ("", "-0") else text


def normalize_length(value: Any) -> str | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return f"{fmt(float(value))}pt" if math.isfinite(value) else None
    if not isinstance(value, str):
        return None
    match = LENGTH_RE.match(value)
    if not match:
        return None
    return f"{fmt(float(match.group(1)))}{match.group(2)}"


def is_zero_length(value: str | None) -> bool:
    if not value:
        return True
    match = LENGTH_RE.match(value)
    return bool(match) and float(match.group(1)) == 0


def escape(text: str) -> str:
    return "".join(_SPECIALS.get(ch, ch) for ch in text)


def escape_url(url: str) -> str:
    url = re.sub(r"[{}\s]", "", url.strip().replace("\\", "/"))
    return url.replace("%", r"\%").replace("#", r"\#").replace("~", r"\string~")


def normalize_url(url: str) -> str:
    url = url.strip()
    if not url:
        return ""
    if SCHEME_RE.match(url):
        return url
    if EMAIL_RE.match(url):
        return "mailto:" + url
    return "https://" + url


def guess_link(text: str) -> str:
    text = text.strip()
    if EMAIL_RE.match(text):
        return "mailto:" + text
    if DOMAIN_RE.match(text):
        return text if text.startswith(("http://", "https://")) else "https://" + text
    return ""


def _str(value: Any) -> str:
    if isinstance(value, str):
        return value
    if value is None or isinstance(value, (dict, list)):
        return ""
    return str(value)


def _list(value: Any) -> list:
    return value if isinstance(value, list) else []


# ---------------------------------------------------------- normalization

def _coerce(path: str, default: Any, value: Any) -> Any:
    if isinstance(default, bool):
        return value if isinstance(value, bool) else default
    if isinstance(default, (int, float)):
        if isinstance(value, bool):
            return default
        try:
            number = float(value)
        except (TypeError, ValueError):
            return default
        if not math.isfinite(number):
            return default
        low, high = NUMBER_RANGES.get(path, (-1e4, 1e4))
        return min(max(number, low), high)
    if isinstance(default, str):
        if not isinstance(value, str):
            return default
        if path in ENUMS:
            return value if value in ENUMS[path] else default
        if LENGTH_RE.match(default):
            return normalize_length(value) or default
        if COLOR_RE.match(default):
            match = COLOR_RE.match(value)
            return "#" + match.group(1).upper() if match else default
        return value
    return default


def _merge(defaults: dict, raw: Any, prefix: str = "") -> dict:
    raw = raw if isinstance(raw, dict) else {}
    merged = {}
    for key, default in defaults.items():
        path = f"{prefix}.{key}" if prefix else key
        value = raw.get(key, default)
        if isinstance(default, dict):
            merged[key] = _merge(default, value, path)
        else:
            merged[key] = _coerce(path, default, value)
    return merged


def normalize_layout(raw: Any) -> dict:
    return _merge(DEFAULT_LAYOUT, raw)


def _normalize_style(raw: Any, schema: dict) -> dict:
    style = {}
    if not isinstance(raw, dict):
        return style
    for key, spec in schema.items():
        value = raw.get(key)
        if value is None or value == "":
            continue
        kind = spec[0]
        result = None
        if kind == "length":
            result = normalize_length(value)
        elif kind == "bool":
            result = value if isinstance(value, bool) else None
        elif kind == "number" and not isinstance(value, bool):
            try:
                number = float(value)
            except (TypeError, ValueError):
                number = None
            if number is not None and math.isfinite(number):
                result = min(max(number, spec[1]), spec[2])
        elif kind == "enum":
            result = value if value in spec[1] else None
        if result is not None:
            style[key] = result
    return style


def _normalize_entry(raw: Any) -> dict | None:
    if not isinstance(raw, dict):
        return None
    bullets = []
    for item in _list(raw.get("bullets")):
        text = _str(item.get("text")) if isinstance(item, dict) else _str(item)
        if text.strip():
            bullets.append(text)
    return {
        "title": _str(raw.get("title")),
        "subtitle": _str(raw.get("subtitle")),
        "date": _str(raw.get("date")),
        "location": _str(raw.get("location")),
        "url": _str(raw.get("url")),
        "description": _str(raw.get("description")),
        "bullets": bullets,
        "hidden": raw.get("hidden") is True,
        "style": _normalize_style(raw.get("style"), ENTRY_STYLE_SCHEMA),
    }


def _normalize_section(raw: Any) -> dict | None:
    if not isinstance(raw, dict) or raw.get("type") not in SECTION_TYPES:
        return None
    section = {
        "type": raw["type"],
        "title": _str(raw.get("title")),
        "hidden": raw.get("hidden") is True,
        "showHeading": raw.get("showHeading") is not False,
        "style": _normalize_style(raw.get("style"), SECTION_STYLE_SCHEMA),
    }
    kind = raw["type"]
    if kind == "entries":
        section["entries"] = [e for e in map(_normalize_entry, _list(raw.get("entries"))) if e]
    elif kind == "skills":
        section["rows"] = [
            {"label": _str(row.get("label")), "value": _str(row.get("value"))}
            for row in _list(raw.get("rows"))
            if isinstance(row, dict) and (_str(row.get("label")).strip() or _str(row.get("value")).strip())
        ]
    elif kind == "text":
        section["text"] = _str(raw.get("text"))
    elif kind == "list":
        items = []
        for item in _list(raw.get("items")):
            text = _str(item.get("text")) if isinstance(item, dict) else _str(item)
            if text.strip():
                items.append(text)
        section["items"] = items
    else:
        section["latex"] = _str(raw.get("latex"))
    return section


def normalize_resume(raw: Any) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    header = raw.get("header") if isinstance(raw.get("header"), dict) else {}
    contacts = []
    for item in _list(header.get("contacts")):
        if not isinstance(item, dict):
            continue
        text, url = _str(item.get("text")), _str(item.get("url"))
        if text.strip() or url.strip():
            contacts.append({"text": text, "url": url, "newLine": item.get("newLine") is True})
    return {
        "header": {
            "name": _str(header.get("name")),
            "headline": _str(header.get("headline")),
            "contacts": contacts,
        },
        "sections": [s for s in map(_normalize_section, _list(raw.get("sections"))) if s],
        "layout": normalize_layout(raw.get("layout")),
    }


# ----------------------------------------------------------------- writer

def _tpl(template: str, **values: Any) -> str:
    for key, value in values.items():
        template = template.replace(f"<<{key}>>", str(value))
    return template


def _font_size(size: float, leading: float) -> str:
    return rf"\fontsize{{{fmt(size)}pt}}{{{fmt(size * leading)}pt}}\selectfont"


class _Writer:
    def __init__(self, doc: dict):
        self.doc = doc
        self.L = doc["layout"]
        self.engine = self.L["typography"]["engine"]
        self.raw_text = self.L["advanced"]["rawText"]
        self.visible = [s for s in doc["sections"] if not s["hidden"]]

    # ---- text

    def text(self, value: str) -> str:
        value = value.strip()
        if self.raw_text:
            return value
        out, pos = [], 0
        for match in INLINE_RE.finditer(value):
            out.append(escape(value[pos:match.start()]))
            if match.group("bold") is not None:
                out.append(r"\textbf{" + self.text(match.group("bold")) + "}")
            elif match.group("italic") is not None:
                out.append(r"\textit{" + self.text(match.group("italic")) + "}")
            elif match.group("code") is not None:
                out.append(r"\texttt{" + escape(match.group("code")) + "}")
            else:
                out.append(self.href(normalize_url(match.group("url")), self.text(match.group("label"))))
            pos = match.end()
        out.append(escape(value[pos:]))
        return "".join(out)

    def paragraphs(self, value: str) -> str:
        blocks = [b for b in re.split(r"\n\s*\n", value.strip()) if b.strip()]
        rendered = []
        for block in blocks:
            lines = [self.text(line) for line in block.splitlines() if line.strip()]
            rendered.append("\\newline\n".join(lines))
        return "\n\n".join(rendered)

    @staticmethod
    def href(url: str, label: str) -> str:
        if not url:
            return label
        return rf"\rbHref{{{escape_url(url)}}}{{{label}}}"

    def letterspace(self, amount: float, inner: str) -> str:
        if not amount:
            return inner
        if self.engine == "xelatex":
            return rf"\addfontfeatures{{LetterSpace={fmt(amount / 10)}}}{inner}"
        return rf"\textls[{int(round(amount))}]{{{inner}}}"

    @staticmethod
    def case(mode: str, inner: str) -> str:
        if mode == "upper":
            return rf"\MakeUppercase{{{inner}}}"
        if mode == "smallcaps":
            return rf"\textsc{{{inner}}}"
        return inner

    def needs_microtype(self) -> bool:
        L = self.L
        spaced = L["header"]["nameLetterSpacing"] or L["section"]["letterSpacing"]
        return L["typography"]["microtype"] or (self.engine == "pdflatex" and bool(spaced))

    # ---- document

    def render(self) -> str:
        lines: list[str] = []
        lines += self.preamble()
        lines.append("")
        lines.append(r"\begin{document}")
        lines += self.document_setup()
        lines.append("")
        lines += self.header()
        for index, section in enumerate(self.visible):
            lines.append("")
            lines += self.section(section, first=index == 0)
        lines.append("")
        lines.append("% Reports page usage back to the builder UI (harmless if compiled elsewhere).")
        lines.append(r"\par\typeout{RBSTATS pages=\thepage\space remaining=\the\dimexpr\pagegoal-\pagetotal\relax}")
        lines.append(r"\end{document}")
        return "\n".join(lines) + "\n"

    # ---- preamble

    def preamble(self) -> list[str]:
        L = self.L
        P, T, C, H, S, E, Li, Sk = (
            L["page"], L["typography"], L["colors"], L["header"],
            L["section"], L["entry"], L["list"], L["skills"],
        )
        out = [
            f"% !TEX program = {self.engine}",
            "% Generated by LaTeX Resume Builder. Every spacing and size from the UI is a",
            "% named length or macro below, so this file can also be tuned by hand.",
            r"\RequirePackage{fix-cm}",
            r"\documentclass[10pt]{article}",
            "",
            "% ---------- Page ----------",
        ]
        width, height = PAPER_SIZES.get(P["paper"], (P["width"], P["height"]))
        geometry = (
            f"paperwidth={width},paperheight={height},"
            f"top={P['marginTop']},bottom={P['marginBottom']},"
            f"left={P['marginLeft']},right={P['marginRight']}"
        )
        if P["pageNumbers"]:
            geometry += f",footskip={P['footerGap']}"
        out.append(rf"\usepackage[{geometry}]{{geometry}}")
        out.append(r"\pagestyle{plain}" if P["pageNumbers"] else r"\pagestyle{empty}")

        out += ["", "% ---------- Fonts ----------"]
        out += self.font_setup()

        out += ["", "% ---------- Packages ----------", r"\usepackage{graphicx}", r"\usepackage{xcolor}"]
        if self.needs_microtype():
            if self.engine == "pdflatex":
                flag = "true" if T["microtype"] else "false"
                out.append(rf"\usepackage[protrusion={flag},expansion={flag}]{{microtype}}")
            else:
                out.append(r"\usepackage{microtype}")
        if T["align"] == "left":
            out.append(r"\usepackage{ragged2e}")
        if self.uses_multicol():
            out.append(r"\usepackage{multicol}")
            out.append(r"\setlength{\multicolsep}{0pt}")
        out.append(r"\usepackage{hyperref}")
        link_options = (
            "colorlinks=true,urlcolor=rbLink,linkcolor=rbLink"
            if L["links"]["style"] == "color"
            else "hidelinks"
        )
        pdf_title = escape(self.doc["header"]["name"].strip() or "Resume")
        out.append(rf"\hypersetup{{{link_options},pdftitle={{{pdf_title} -- Resume}},pdfauthor={{{pdf_title}}}}}")

        out += ["", "% ---------- Colors ----------"]
        for key, name in (
            ("text", "rbText"), ("name", "rbName"), ("headline", "rbHeadline"),
            ("contact", "rbContact"), ("heading", "rbHeading"), ("rule", "rbRule"),
            ("muted", "rbMuted"), ("link", "rbLink"), ("bullet", "rbBullet"),
        ):
            out.append(rf"\definecolor{{{name}}}{{HTML}}{{{C[key].lstrip('#')}}}")

        out += [
            "",
            "% ---------- Spacing & widths ----------",
            r"\setlength{\parindent}{0pt}",
            rf"\setlength{{\parskip}}{{{T['paragraphGap']}}}",
            r"\setlength{\emergencystretch}{1em}",
        ]
        lengths = [
            ("rbNameGap", H["nameGap"], "name -> headline"),
            ("rbHeadlineGap", H["headlineGap"], "headline -> contact line"),
            ("rbHeaderGap", H["headerGap"], "header -> first section"),
            ("rbContactSepSpace", H["separatorSpace"], "space around contact separators"),
            ("rbContactRowGap", H["contactRowGap"], "between contact rows"),
            ("rbHeaderRightWidth", H["splitRightWidth"], "contact column width (split header)"),
            ("rbSectionSpaceBefore", S["spaceBefore"], "above each section heading"),
            ("rbSectionSpaceAfter", S["spaceAfter"], "heading -> section content"),
            ("rbSectionRuleGap", S["ruleGap"], "heading text <-> rule"),
            ("rbSectionRuleThickness", S["ruleThickness"], "rule thickness"),
            ("rbSectionRuleRaise", S["ruleRaise"], "inline rule height above baseline"),
            ("rbContentIndent", S["contentIndent"], "left indent of section content"),
            ("rbEntryGap", E["entryGap"], "between entries"),
            ("rbEntryLineGap", E["lineGap"], "title line -> subtitle line"),
            ("rbEntryDescGap", E["descriptionGap"], "above entry description"),
            ("rbEntryInlineSpace", E["inlineSpace"], "around one-line entry separators"),
            ("rbListIndent", Li["indent"], "left margin -> bullet text"),
            ("rbListLabelSep", Li["labelSep"], "bullet symbol -> text"),
            ("rbListItemSep", Li["itemSep"], "between bullets"),
            ("rbListSpaceBefore", Li["spaceBefore"], "above a bullet list"),
            ("rbListSpaceAfter", Li["spaceAfter"], "below a bullet list"),
            ("rbListRightMargin", Li["rightMargin"], "right margin of bullet lists"),
            ("rbBulletRaise", Li["bulletRaise"], "vertical nudge of the bullet symbol"),
            ("rbListInlineSpace", Li["inlineSpace"], "around inline-list separators"),
            ("rbListColumnGap", Li["columnGap"], "gap between list columns"),
            ("rbSkillLabelWidth", Sk["labelWidth"], "skills label column width"),
            ("rbSkillColGap", Sk["columnGap"], "skills label -> value"),
            ("rbSkillRowGap", Sk["rowGap"], "between skills rows"),
        ]
        pad = max(len(name) for name, _, _ in lengths) + 2
        for name, value, note in lengths:
            decl = rf"\newlength{{\{name}}}\setlength{{\{name}}}{{{value}}}"
            out.append(f"{decl:<{pad * 2 + 30}}% {note}")

        out += ["", "% ---------- Font sizes (size / line height) ----------"]
        lead = T["lineHeight"]
        head_size = max(E["titleSize"], E["dateSize"], E["subtitleSize"] if E["layout"] == "oneLine" else 0)
        sub_size = max(E["subtitleSize"], E["dateSize"])
        for name, size, leading in (
            ("rbBodySize", T["bodySize"], lead),
            ("rbNameSize", H["nameSize"], 1.15),
            ("rbHeadlineSize", H["headlineSize"], lead),
            ("rbContactSize", H["contactSize"], lead),
            ("rbSectionSize", S["size"], lead),
            ("rbTitleSize", E["titleSize"], lead),
            ("rbSubtitleSize", E["subtitleSize"], lead),
            ("rbDateSize", E["dateSize"], lead),
            ("rbEntryHeadSize", head_size, lead),
            ("rbEntrySubSize", sub_size, lead),
        ):
            out.append(rf"\newcommand{{\{name}}}{{{_font_size(size, leading)}}}")

        out += ["", "% ---------- Building blocks ----------"]
        out += self.macros()

        custom = L["advanced"]["preamble"].strip()
        if custom:
            out += ["", "% ---------- Custom preamble ----------", custom]
        return out

    def font_setup(self) -> list[str]:
        T = self.L["typography"]
        if self.engine == "xelatex":
            out = [r"\usepackage{fontspec}"]
            body = FONT_NAME_STRIP_RE.sub("", T["bodyFont"]).strip()
            heading = FONT_NAME_STRIP_RE.sub("", T["headingFont"]).strip()
            if body:
                out.append(rf"\setmainfont{{{body}}}")
            if heading:
                out.append(rf"\newfontfamily\rbHeadingFamily{{{heading}}}")
            else:
                out.append(r"\newcommand{\rbHeadingFamily}{}")
            return out
        body = T["pdfBodyFont"] if NFSS_FAMILY_RE.match(T["pdfBodyFont"]) else "lmr"
        heading = T["pdfHeadingFont"] if NFSS_FAMILY_RE.match(T["pdfHeadingFont"]) else ""
        out = [
            r"\usepackage[T1]{fontenc}",
            r"\usepackage[utf8]{inputenc}",
            rf"\renewcommand{{\familydefault}}{{{body}}}",
        ]
        if heading:
            out.append(rf"\newcommand{{\rbHeadingFamily}}{{\fontfamily{{{heading}}}\selectfont}}")
        else:
            out.append(r"\newcommand{\rbHeadingFamily}{}")
        return out

    def uses_multicol(self) -> bool:
        return any(
            s["type"] == "list"
            and s["style"].get("listStyle", "bullets") == "bullets"
            and int(s["style"].get("columns", 1)) > 1
            for s in self.visible
        )

    def macros(self) -> list[str]:
        L = self.L
        H, S, E, Li, Sk = L["header"], L["section"], L["entry"], L["list"], L["skills"]
        bold = r"\bfseries"
        italic = r"\itshape"

        name_inner = self.letterspace(H["nameLetterSpacing"], self.case(H["nameCase"], "#1"))
        headline_style = {"normal": "", "italic": italic, "bold": bold, "smallcaps": r"\scshape"}[H["headlineStyle"]]
        separator = escape(H["separator"].strip())
        section_font = (
            r"\rbHeadingFamily\rbSectionSize"
            + (bold if S["bold"] else "")
            + (italic if S["italic"] else "")
            + r"\color{rbHeading}"
        )
        section_inner = self.letterspace(S["letterSpacing"], self.case(S["case"], "#1"))
        title_family = r"\rbHeadingFamily" if E["titleFont"] == "heading" else ""

        if Li["symbol"] == "custom":
            symbol = Li["customSymbol"].strip() or r"\textbullet"
        else:
            symbol = BULLET_SYMBOLS[Li["symbol"]]
        bullet = (
            rf"\textcolor{{rbBullet}}{{\raisebox{{\rbBulletRaise}}{{\scalebox{{{fmt(Li['bulletScale'])}}}{{{symbol}}}}}}}"
            if symbol
            else ""
        )

        link_body = r"\underline{#2}" if L["links"]["style"] == "underline" else "#2"
        out = [
            rf"\newcommand{{\rbHref}}[2]{{\href{{#1}}{{{link_body}}}}}",
            r"\newcommand{\rbPushRight}{\hspace{0pt plus 1filll}}",
            "",
            "% Header",
            rf"\newcommand{{\rbName}}[1]{{{{\rbHeadingFamily\rbNameSize{bold if H['nameBold'] else ''}\color{{rbName}}\leavevmode{name_inner}\par}}}}",
            rf"\newcommand{{\rbHeadline}}[1]{{{{\rbHeadlineSize{headline_style}\color{{rbHeadline}}\leavevmode#1\par}}}}",
            "% Separators vanish at line breaks (empty pre/post-break discretionary).",
            r"\newcommand{\rbContacts}[1]{{\rbContactSize\color{rbContact}\exhyphenpenalty=0\leavevmode#1\par}}",
            _tpl(
                r"\newcommand{\rbContactSep}{\unskip\discretionary{}{}{\hbox{\hspace{\rbContactSepSpace}\textcolor{rbMuted}{<<sep>>}\hspace{\rbContactSepSpace}}}\ignorespaces}",
                sep=separator,
            ),
            "",
            "% Section heading: \\rbSection[space above]{Title}",
            rf"\newcommand{{\rbSectionTitle}}[1]{{{{{section_font}{section_inner}}}}}",
        ]
        out += self.section_macro(S)
        out += [
            "",
            "% Entries",
            rf"\newcommand{{\rbTitle}}[1]{{{{{title_family}\rbTitleSize{bold if E['titleBold'] else ''}{italic if E['titleItalic'] else ''}#1}}}}",
            rf"\newcommand{{\rbSubtitle}}[1]{{{{\rbSubtitleSize{bold if E['subtitleBold'] else ''}{italic if E['subtitleItalic'] else ''}#1}}}}",
            rf"\newcommand{{\rbDate}}[1]{{{{\rbDateSize{bold if E['dateBold'] else ''}{italic if E['dateItalic'] else ''}\color{{rbMuted}}#1}}}}",
            rf"\newcommand{{\rbLocation}}[1]{{{{\rbDateSize{italic if E['locationItalic'] else ''}\color{{rbMuted}}#1}}}}",
            _tpl(
                r"\newcommand{\rbInlineSep}{\hspace{\rbEntryInlineSpace}{\color{rbMuted}<<sep>>}\hspace{\rbEntryInlineSpace}}",
                sep=escape(E["inlineSeparator"].strip()),
            ),
            r"\newcommand{\rbEntryHead}[2]{\par{\rbEntryHeadSize\leavevmode#1\rbPushRight#2\par}}",
            r"\newcommand{\rbEntrySub}[2]{\par\nopagebreak\vspace{\rbEntryLineGap}{\rbEntrySubSize\leavevmode#1\rbPushRight#2\par}}",
            r"\newcommand{\rbEntryDesc}[1]{\par\nopagebreak\vspace{\rbEntryDescGap}{\leavevmode#1\par}}",
            r"\newcommand{\rbContentStart}{\leftskip=\rbContentIndent\relax}",
            "",
            "% Bullet lists",
            rf"\newcommand{{\rbBulletLabel}}{{{bullet}}}",
            r"\makeatletter",
            r"\newenvironment{rbBullets}{%",
            r"  \par\vspace{\rbListSpaceBefore}%",
            r"  \begin{list}{\rbBulletLabel}{%",
            r"    \leftskip=0pt\relax",
            r"    \setlength{\leftmargin}{\dimexpr\rbListIndent+\rbContentIndent\relax}%",
            r"    \setlength{\rightmargin}{\rbListRightMargin}%",
            r"    \setlength{\labelwidth}{0pt}%",
            r"    \setlength{\labelsep}{\rbListLabelSep}%",
            r"    \setlength{\itemsep}{\rbListItemSep}%",
            r"    \setlength{\itemindent}{0pt}%",
            r"    \setlength{\listparindent}{0pt}%",
            r"    \setlength{\parsep}{0pt}%",
            r"    \setlength{\topsep}{0pt}%",
            r"    \setlength{\partopsep}{0pt}%",
            r"    \@beginparpenalty=\@M",
            r"    \renewcommand{\makelabel}[1]{\llap{##1}}}%",
            r"}{%",
            r"  \end{list}%",
            r"  \vspace{\rbListSpaceAfter}%",
            r"}",
            r"\makeatother",
            _tpl(
                r"\newcommand{\rbListInlineSep}{\unskip\discretionary{}{}{\hbox{\hspace{\rbListInlineSpace}\textcolor{rbMuted}{<<sep>>}\hspace{\rbListInlineSpace}}}\ignorespaces}",
                sep=escape(Li["inlineSeparator"].strip()),
            ),
            "",
            "% Skills rows",
            rf"\newcommand{{\rbSkillLabel}}[1]{{{{{bold if Sk['labelBold'] else ''}#1}}}}",
        ]
        if Sk["layout"] == "table":
            out.append(
                r"\newcommand{\rbSkillRow}[2]{\par\hangindent=\dimexpr\rbSkillLabelWidth+\rbSkillColGap\relax"
                r"\hangafter=1\noindent\makebox[\rbSkillLabelWidth][l]{\rbSkillLabel{#1}}\hspace{\rbSkillColGap}#2\par}"
            )
        else:
            out.append(r"\newcommand{\rbSkillRow}[2]{\par\noindent\rbSkillLabel{#1}\hspace{\rbSkillColGap}#2\par}")
        return out

    @staticmethod
    def section_macro(S: dict) -> list[str]:
        align = {"left": "", "center": r"\centering", "right": r"\raggedleft"}[S["align"]]
        rule = r"{\color{rbRule}\hrule height \rbSectionRuleThickness}"
        title = r"{" + align + r"\rbSectionSize\leavevmode\rbSectionTitle{#2}\par}"
        head = [r"\newcommand{\rbSection}[2][\rbSectionSpaceBefore]{%", r"  \par\vspace{#1}%"]
        tail = [r"  \vspace{\rbSectionSpaceAfter}%", r"}"]
        style = S["rule"]
        if style == "below":
            body = [
                f"  {title}\\nopagebreak",
                r"  \vspace{\rbSectionRuleGap}%",
                f"  {rule}\\nopagebreak",
            ]
        elif style == "above":
            body = [
                f"  {rule}\\nopagebreak",
                r"  \vspace{\rbSectionRuleGap}%",
                f"  {title}\\nopagebreak",
            ]
        elif style == "inline":
            leader = (
                r"{\color{rbRule}\leaders\hrule height \dimexpr\rbSectionRuleRaise+\rbSectionRuleThickness\relax"
                r" depth -\rbSectionRuleRaise\hskip 0pt plus 1filll}"
            )
            gap = r"\hspace{\rbSectionRuleGap}"
            if S["align"] == "left":
                line = r"\rbSectionTitle{#2}" + gap + leader
            elif S["align"] == "right":
                line = leader + gap + r"\rbSectionTitle{#2}"
            else:
                line = leader + gap + r"\rbSectionTitle{#2}" + gap + leader
            body = [r"  {\rbSectionSize\noindent " + line + r"\par}\nopagebreak"]
        else:
            body = [f"  {title}\\nopagebreak"]
        return head + body + tail

    def document_setup(self) -> list[str]:
        T = self.L["typography"]
        out = [r"\rbBodySize", r"\color{rbText}"]
        if T["align"] == "left":
            out.append(r"\RaggedRight")
        if not T["hyphenate"]:
            out.append(r"\hyphenpenalty=10000 \exhyphenpenalty=10000")
        return out

    # ---- header

    def contact(self, item: dict) -> str:
        label = self.text(item["text"]) or escape(item["url"])
        if item["url"].strip():
            url = normalize_url(item["url"])
        elif self.L["header"]["autoLink"]:
            url = guess_link(item["text"])
        else:
            url = ""
        return rf"\mbox{{{self.href(url, label)}}}"

    def header(self) -> list[str]:
        H = self.L["header"]
        data = self.doc["header"]
        name = self.text(data["name"])
        headline = self.text(data["headline"])
        contacts = data["contacts"]
        out = ["%% ---------- Header ----------"]
        if not (name or headline or contacts):
            return out

        if H["layout"] == "split":
            out.append(r"\noindent")
            out.append(r"\begin{minipage}[b]{\dimexpr\linewidth-\rbHeaderRightWidth\relax}")
            out.append(r"\raggedright")
            if name:
                out.append(rf"\rbName{{{name}}}")
            if headline:
                if name:
                    out.append(r"\nointerlineskip\vspace{\rbNameGap}")
                out.append(rf"\rbHeadline{{{headline}}}")
            out.append(r"\end{minipage}%")
            out.append(r"\begin{minipage}[b]{\rbHeaderRightWidth}")
            out.append(r"\raggedleft")
            for index, item in enumerate(contacts):
                if index:
                    out.append(r"\vspace{\rbContactRowGap}")
                out.append(rf"\rbContacts{{{self.contact(item)}}}")
            out.append(r"\end{minipage}\par")
        else:
            align = {"left": r"\raggedright", "center": r"\centering", "right": r"\raggedleft"}[H["align"]]
            out.append(r"\begingroup" + align)
            previous_gap = None
            if name:
                out.append(rf"\rbName{{{name}}}")
                previous_gap = r"\rbNameGap"
            if headline:
                if previous_gap:
                    out.append(rf"\nointerlineskip\vspace{{{previous_gap}}}")
                out.append(rf"\rbHeadline{{{headline}}}")
                previous_gap = r"\rbHeadlineGap"
            if contacts:
                if previous_gap:
                    out.append(rf"\nointerlineskip\vspace{{{previous_gap}}}")
                parts = []
                for index, item in enumerate(contacts):
                    if index:
                        parts.append(r"\\[\rbContactRowGap]" if item["newLine"] else r"\rbContactSep")
                    parts.append(self.contact(item))
                out.append(r"\rbContacts{%")
                out += [f"  {part}%" for part in parts]
                out.append("}")
            out.append(r"\endgroup")
        out.append(r"\vspace{\rbHeaderGap}")
        return out

    # ---- sections

    def section(self, section: dict, first: bool) -> list[str]:
        style = section["style"]
        title = self.text(section["title"])
        label = re.sub(r"\s+", " ", section["title"]).strip() or section["type"]
        out = [f"%% ---------- Section: {label} ----------"]
        if style.get("pageBreakBefore"):
            out.append(r"\newpage")
        out.append(r"\begingroup")
        for key, length in SECTION_LENGTH_OVERRIDES.items():
            if key in style:
                out.append(rf"\setlength{{\{length}}}{{{style[key]}}}% section override")

        space_before = style.get("spaceBefore") or ("0pt" if first else None)
        if section["showHeading"] and title:
            option = f"[{space_before}]" if space_before else ""
            out.append(rf"\rbSection{option}{{{title}}}")
        elif space_before:
            out.append(rf"\par\vspace{{{space_before}}}")
        elif not first:
            out.append(r"\par\vspace{\rbSectionSpaceBefore}")

        if "bodySize" in style:
            out.append(_font_size(style["bodySize"], self.L["typography"]["lineHeight"]) + "% section override")
        out.append(r"\rbContentStart")

        kind = section["type"]
        if kind == "entries":
            out += self.entries(section)
        elif kind == "skills":
            out += self.skills(section)
        elif kind == "text":
            if section["text"].strip():
                out.append(self.paragraphs(section["text"]))
        elif kind == "list":
            out += self.list_section(section)
        else:
            if section["latex"].strip():
                out.append(section["latex"].rstrip())
        out.append(r"\par")
        out.append(r"\endgroup")
        extra = style.get("extraSpaceAfter")
        if extra and not is_zero_length(extra):
            out.append(rf"\vspace{{{extra}}}")
        return out

    def bullets(self, items: list[str]) -> list[str]:
        if not items:
            return []
        out = [r"\begin{rbBullets}"]
        out += [rf"  \item {self.text(item)}" for item in items]
        out.append(r"\end{rbBullets}")
        return out

    def entries(self, section: dict) -> list[str]:
        out: list[str] = []
        visible = [e for e in section["entries"] if not e["hidden"]]
        for index, entry in enumerate(visible):
            style = entry["style"]
            if index:
                out.append(r"\vspace{\rbEntryGap}")
            if style.get("pageBreakBefore"):
                out.append(r"\newpage")
            if not is_zero_length(style.get("spaceBefore")):
                out.append(rf"\vspace{{{style['spaceBefore']}}}% entry fine-tune")
            grouped = "itemSep" in style
            if grouped:
                out.append(rf"\begingroup\setlength{{\rbListItemSep}}{{{style['itemSep']}}}% entry override")

            title = self.text(entry["title"])
            if entry["url"].strip() and title:
                title = self.href(normalize_url(entry["url"]), title)
            subtitle = self.text(entry["subtitle"])
            date = self.text(entry["date"])
            location = self.text(entry["location"])

            if self.L["entry"]["layout"] == "oneLine":
                left = rf"\rbTitle{{{title}}}" if title else ""
                if subtitle:
                    left += (r"\rbInlineSep" if left else "") + rf"\rbSubtitle{{{subtitle}}}"
                right = rf"\rbLocation{{{location}}}" if location else ""
                if date:
                    right += (r"\rbInlineSep" if right else "") + rf"\rbDate{{{date}}}"
                if left or right:
                    out.append(rf"\rbEntryHead{{{left}}}{{{right}}}")
            else:
                if title or date:
                    out.append(rf"\rbEntryHead{{\rbTitle{{{title}}}}}{{\rbDate{{{date}}}}}")
                if subtitle or location:
                    out.append(rf"\rbEntrySub{{\rbSubtitle{{{subtitle}}}}}{{\rbLocation{{{location}}}}}")
            if entry["description"].strip():
                out.append(rf"\rbEntryDesc{{{self.paragraphs(entry['description'])}}}")
            out += self.bullets(entry["bullets"])
            if grouped:
                out.append(r"\endgroup")
            if not is_zero_length(style.get("spaceAfter")):
                out.append(rf"\vspace{{{style['spaceAfter']}}}% entry fine-tune")
        return out

    def skills(self, section: dict) -> list[str]:
        suffix = escape(self.L["skills"]["labelSuffix"])
        out = []
        for index, row in enumerate(section["rows"]):
            if index:
                out.append(r"\vspace{\rbSkillRowGap}")
            label = self.text(row["label"])
            out.append(rf"\rbSkillRow{{{label}{suffix if label else ''}}}{{{self.text(row['value'])}}}")
        return out

    def list_section(self, section: dict) -> list[str]:
        items = section["items"]
        if not items:
            return []
        style = section["style"]
        if style.get("listStyle") == "inline":
            joined = "\n".join(
                (r"\rbListInlineSep " if index else "") + self.text(item)
                for index, item in enumerate(items)
            )
            return [r"{\exhyphenpenalty=0\leavevmode", joined, r"\par}"]
        columns = int(style.get("columns", 1))
        if columns <= 1:
            return self.bullets(items)
        return [
            r"\setlength{\columnsep}{\rbListColumnGap}\raggedcolumns",
            rf"\begin{{multicols}}{{{columns}}}\raggedright",
            *self.bullets(items),
            r"\end{multicols}",
        ]


def generate_latex(resume: Any) -> str:
    """Return the full LaTeX source for ``resume`` (raw JSON-compatible dict)."""
    return _Writer(normalize_resume(resume)).render()


def engine_for(resume: Any) -> str:
    return normalize_layout((resume or {}).get("layout") if isinstance(resume, dict) else None)["typography"]["engine"]

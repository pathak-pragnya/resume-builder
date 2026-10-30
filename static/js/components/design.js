import { html } from '../html.js';
import { getIn } from '../util.js';
import {
  AutoTextarea,
  ColorField,
  Field,
  FontField,
  Group,
  LengthField,
  NumberField,
  SegmentedField,
  SelectField,
  TextInput,
  ToggleField,
} from './fields.js';

const PAPERS = [
  { value: 'letter', label: 'US Letter (8.5 × 11 in)' },
  { value: 'a4', label: 'A4 (210 × 297 mm)' },
  { value: 'legal', label: 'US Legal (8.5 × 14 in)' },
  { value: 'custom', label: 'Custom size…' },
];

const ALIGN3 = [
  { value: 'left', label: 'Left', icon: 'align-left' },
  { value: 'center', label: 'Center', icon: 'align-center' },
  { value: 'right', label: 'Right', icon: 'align-right' },
];

const CASES = [
  { value: 'none', label: 'Aa', title: 'As typed' },
  { value: 'upper', label: 'AA', title: 'UPPERCASE' },
  { value: 'smallcaps', label: 'Sᴄ', title: 'Small caps (font must support it)' },
];

const BULLETS = [
  { value: 'bullet', label: '•  Bullet' },
  { value: 'dash', label: '–  En dash' },
  { value: 'emdash', label: '—  Em dash' },
  { value: 'square', label: '■  Square' },
  { value: 'circle', label: '∘  Circle' },
  { value: 'triangle', label: '▹  Triangle' },
  { value: 'arrow', label: '→  Arrow' },
  { value: 'chevron', label: '»  Chevron' },
  { value: 'star', label: '⋆  Star' },
  { value: 'none', label: 'None' },
  { value: 'custom', label: 'Custom LaTeX…' },
];

const COLOR_FIELDS = [
  ['text', 'Body text'],
  ['name', 'Name'],
  ['headline', 'Headline'],
  ['contact', 'Contact line'],
  ['heading', 'Section headings'],
  ['rule', 'Heading rules'],
  ['muted', 'Dates & separators'],
  ['bullet', 'Bullets'],
  ['link', 'Links (colored style)'],
];

const PALETTES = {
  Navy: { text: '#1F2328', name: '#14213D', headline: '#3D4B63', contact: '#3D4B63', heading: '#14213D', rule: '#14213D', muted: '#5B6472', bullet: '#14213D', link: '#1D4ED8' },
  Charcoal: { text: '#111111', name: '#111111', headline: '#444444', contact: '#444444', heading: '#111111', rule: '#111111', muted: '#555555', bullet: '#111111', link: '#111111' },
  Teal: { text: '#1C2526', name: '#0F4C5C', headline: '#2F6B73', contact: '#3F5559', heading: '#0F766E', rule: '#0F766E', muted: '#5A6B6E', bullet: '#0F766E', link: '#0E7490' },
  Burgundy: { text: '#231F20', name: '#5B1A2B', headline: '#7A3B4A', contact: '#5B4A4F', heading: '#7F1D1D', rule: '#7F1D1D', muted: '#6B5B5F', bullet: '#7F1D1D', link: '#9F1239' },
  Forest: { text: '#1E2420', name: '#1F3D2B', headline: '#3E5A48', contact: '#46584C', heading: '#2F5D3A', rule: '#2F5D3A', muted: '#5D6B61', bullet: '#2F5D3A', link: '#15803D' },
};

export function DesignPanel({ layout, setLayout, applyLayout, config }) {
  const bind = (path) => ({ value: getIn(layout, path.split('.')), onChange: (v) => setLayout(path, v) });
  const { page, typography: T, header: H, section: S, entry: E, list: Li, skills: Sk } = layout;
  const engines = config.engines || {};
  const xeFonts = config.fonts?.xelatex || [];
  const pdfFonts = config.fonts?.pdflatex?.length ? config.fonts.pdflatex : [{ id: 'lmr', label: 'Latin Modern Roman' }];
  const ruleUsed = S.rule !== 'none';

  return html`
    <div class="panel-scroll">
      <p class="hint">
        Every value here is global. Sections and entries can override spacing in their own “spacing & layout” panels on the Content tab.
        Tip: drag a field label left/right to scrub, or use ↑/↓ (Shift ×10, Alt ×0.1).
      </p>

      <${Group} id="design.page" title="Page" className="card">
        <div class="grid">
          <${SelectField} label="Paper size" wide options=${PAPERS} ...${bind('page.paper')} />
          ${page.paper === 'custom'
            ? html`<${LengthField} label="Page width" min=${1} ...${bind('page.width')} />
                <${LengthField} label="Page height" min=${1} ...${bind('page.height')} />`
            : null}
          <${LengthField} label="Top margin" min=${0} ...${bind('page.marginTop')} />
          <${LengthField} label="Bottom margin" min=${0} ...${bind('page.marginBottom')} />
          <${LengthField} label="Left margin" min=${0} ...${bind('page.marginLeft')} />
          <${LengthField} label="Right margin" min=${0} ...${bind('page.marginRight')} />
          <${ToggleField} label="Page numbers" ...${bind('page.pageNumbers')} />
          ${page.pageNumbers ? html`<${LengthField} label="Footer distance" hint="Baseline of the page number below the text block." ...${bind('page.footerGap')} />` : null}
        </div>
        <div class="btn-row">
          <span class="btn-row__label">Margins:</span>
          ${[
            ['Narrow', '0.4in'],
            ['Normal', '0.6in'],
            ['Wide', '0.9in'],
          ].map(
            ([label, value]) => html`<button
              type="button"
              class="btn btn--ghost btn--xs"
              onClick=${() =>
                applyLayout((L) => {
                  L.page.marginTop = L.page.marginBottom = L.page.marginLeft = L.page.marginRight = value;
                })}
            >
              ${label} (${value})
            </button>`,
          )}
        </div>
      <//>

      <${Group} id="design.type" title="Typography" className="card">
        <div class="grid">
          <${SegmentedField}
            label="TeX engine"
            wide
            hint="XeLaTeX can use any font installed on this Mac. pdfLaTeX uses TeX font packages."
            options=${[
              { value: 'xelatex', label: `XeLaTeX · system fonts${engines.xelatex === false ? ' (missing)' : ''}` },
              { value: 'pdflatex', label: `pdfLaTeX${engines.pdflatex === false ? ' (missing)' : ''}` },
            ]}
            ...${bind('typography.engine')}
          />
          ${T.engine === 'xelatex'
            ? html`
                <${FontField} label="Body font" fonts=${xeFonts} placeholder="Latin Modern (default)" hint="Pick a detected font or type any installed font name." ...${bind('typography.bodyFont')} />
                <${FontField} label="Heading font" fonts=${xeFonts} placeholder="Same as body" hint="Used for the name and section headings." ...${bind('typography.headingFont')} />
              `
            : html`
                <${SelectField} label="Body font" options=${pdfFonts.map((f) => ({ value: f.id, label: f.label }))} ...${bind('typography.pdfBodyFont')} />
                <${SelectField}
                  label="Heading font"
                  options=${[{ value: '', label: 'Same as body' }, ...pdfFonts.map((f) => ({ value: f.id, label: f.label }))]}
                  ...${bind('typography.pdfHeadingFont')}
                />
              `}
          <${NumberField} label="Body size" suffix="pt" step=${0.25} min=${4} max=${40} ...${bind('typography.bodySize')} />
          <${NumberField} label="Line height" suffix="×" step=${0.01} min=${0.7} max=${3} hint="Baseline distance as a multiple of the font size." ...${bind('typography.lineHeight')} />
          <${SegmentedField}
            label="Text alignment"
            options=${[
              { value: 'justify', label: 'Justified' },
              { value: 'left', label: 'Ragged right' },
            ]}
            ...${bind('typography.align')}
          />
          <${LengthField} label="Paragraph gap" hint="Extra space between paragraphs (\\parskip)." ...${bind('typography.paragraphGap')} />
          <${ToggleField} label="Microtype" hint="Character protrusion (and font expansion on pdfLaTeX) for tighter, even text." ...${bind('typography.microtype')} />
          <${ToggleField} label="Hyphenation" ...${bind('typography.hyphenate')} />
        </div>
      <//>

      <${Group} id="design.colors" title="Colors" className="card">
        <div class="btn-row">
          <span class="btn-row__label">Palettes:</span>
          ${Object.entries(PALETTES).map(
            ([name, palette]) => html`<button
              type="button"
              class="btn btn--ghost btn--xs palette-btn"
              onClick=${() => applyLayout((L) => Object.assign(L.colors, palette))}
            >
              <span class="palette-dot" style=${{ background: palette.heading }}></span>${name}
            </button>`,
          )}
        </div>
        <div class="grid">
          ${COLOR_FIELDS.map(([key, label]) => html`<${ColorField} label=${label} ...${bind(`colors.${key}`)} />`)}
        </div>
      <//>

      <${Group} id="design.header" title="Header" className="card">
        <div class="grid">
          <${SegmentedField}
            label="Layout"
            options=${[
              { value: 'stacked', label: 'Stacked' },
              { value: 'split', label: 'Name left · contacts right' },
            ]}
            wide
            ...${bind('header.layout')}
          />
          ${H.layout === 'stacked'
            ? html`<${SegmentedField} label="Alignment" options=${ALIGN3} ...${bind('header.align')} />`
            : html`<${LengthField} label="Contact column width" min=${0} ...${bind('header.splitRightWidth')} />`}
          <${NumberField} label="Name size" suffix="pt" step=${0.5} min=${4} max=${96} ...${bind('header.nameSize')} />
          <${ToggleField} label="Name bold" ...${bind('header.nameBold')} />
          <${SegmentedField} label="Name case" options=${CASES} ...${bind('header.nameCase')} />
          <${NumberField} label="Name letter spacing" suffix="‰em" step=${5} digits=${1} hint="Tracking in thousandths of an em." ...${bind('header.nameLetterSpacing')} />
          <${NumberField} label="Headline size" suffix="pt" step=${0.25} min=${4} max=${48} ...${bind('header.headlineSize')} />
          <${SelectField}
            label="Headline style"
            options=${[
              { value: 'normal', label: 'Regular' },
              { value: 'italic', label: 'Italic' },
              { value: 'bold', label: 'Bold' },
              { value: 'smallcaps', label: 'Small caps' },
            ]}
            ...${bind('header.headlineStyle')}
          />
          <${NumberField} label="Contact size" suffix="pt" step=${0.25} min=${4} max=${40} ...${bind('header.contactSize')} />
          ${H.layout === 'stacked'
            ? html`
                <${Field} label="Contact separator"><${TextInput} value=${H.separator} onChange=${(v) => setLayout('header.separator', v)} placeholder="|" /><//>
                <${LengthField} label="Separator spacing" min=${0} ...${bind('header.separatorSpace')} />
              `
            : null}
          <${LengthField} label="Name → headline" hint="Exact gap between the name and headline boxes." ...${bind('header.nameGap')} />
          <${LengthField} label="Headline → contacts" ...${bind('header.headlineGap')} />
          <${LengthField} label="Contact row gap" hint="Between contact lines (new-line items or split layout)." ...${bind('header.contactRowGap')} />
          <${LengthField} label="Header → first section" ...${bind('header.headerGap')} />
          <${ToggleField} label="Auto-link emails & URLs" wide ...${bind('header.autoLink')} />
        </div>
      <//>

      <${Group} id="design.section" title="Section headings" className="card">
        <div class="grid">
          <${NumberField} label="Size" suffix="pt" step=${0.25} min=${4} max=${48} ...${bind('section.size')} />
          <${SegmentedField} label="Case" options=${CASES} ...${bind('section.case')} />
          <${ToggleField} label="Bold" ...${bind('section.bold')} />
          <${ToggleField} label="Italic" ...${bind('section.italic')} />
          <${NumberField} label="Letter spacing" suffix="‰em" step=${5} digits=${1} ...${bind('section.letterSpacing')} />
          <${SegmentedField} label="Alignment" options=${ALIGN3} ...${bind('section.align')} />
          <${SelectField}
            label="Rule"
            wide
            options=${[
              { value: 'below', label: 'Line below the title' },
              { value: 'above', label: 'Line above the title' },
              { value: 'inline', label: 'Line beside the title (fills the row)' },
              { value: 'none', label: 'No line' },
            ]}
            ...${bind('section.rule')}
          />
          ${ruleUsed
            ? html`
                <${LengthField} label="Rule thickness" min=${0} ...${bind('section.ruleThickness')} />
                <${LengthField} label=${S.rule === 'inline' ? 'Title ↔ rule gap' : 'Text ↔ rule gap'} ...${bind('section.ruleGap')} />
              `
            : null}
          ${S.rule === 'inline' ? html`<${LengthField} label="Rule height above baseline" ...${bind('section.ruleRaise')} />` : null}
          <${LengthField} label="Space above heading" ...${bind('section.spaceBefore')} />
          <${LengthField} label="Heading → content" ...${bind('section.spaceAfter')} />
          <${LengthField} label="Content indent" hint="Shifts everything under the heading to the right." ...${bind('section.contentIndent')} />
        </div>
      <//>

      <${Group} id="design.entry" title="Entries (experience, education…)" className="card">
        <div class="grid">
          <${SegmentedField}
            label="Entry layout"
            wide
            options=${[
              { value: 'twoLine', label: 'Two lines: title / subtitle' },
              { value: 'oneLine', label: 'One line: title | subtitle' },
            ]}
            ...${bind('entry.layout')}
          />
          <${NumberField} label="Title size" suffix="pt" step=${0.25} min=${4} max=${40} ...${bind('entry.titleSize')} />
          <${SegmentedField}
            label="Title font"
            options=${[
              { value: 'body', label: 'Body' },
              { value: 'heading', label: 'Heading' },
            ]}
            ...${bind('entry.titleFont')}
          />
          <${ToggleField} label="Title bold" ...${bind('entry.titleBold')} />
          <${ToggleField} label="Title italic" ...${bind('entry.titleItalic')} />
          <${NumberField} label="Subtitle size" suffix="pt" step=${0.25} min=${4} max=${40} ...${bind('entry.subtitleSize')} />
          <${ToggleField} label="Subtitle bold" ...${bind('entry.subtitleBold')} />
          <${ToggleField} label="Subtitle italic" ...${bind('entry.subtitleItalic')} />
          <${NumberField} label="Date & location size" suffix="pt" step=${0.25} min=${4} max=${40} ...${bind('entry.dateSize')} />
          <${ToggleField} label="Date bold" ...${bind('entry.dateBold')} />
          <${ToggleField} label="Date italic" ...${bind('entry.dateItalic')} />
          <${ToggleField} label="Location italic" ...${bind('entry.locationItalic')} />
          ${E.layout === 'oneLine'
            ? html`
                <${Field} label="Inline separator"><${TextInput} value=${E.inlineSeparator} onChange=${(v) => setLayout('entry.inlineSeparator', v)} /><//>
                <${LengthField} label="Separator spacing" min=${0} ...${bind('entry.inlineSpace')} />
              `
            : html`<${LengthField} label="Title → subtitle line" ...${bind('entry.lineGap')} />`}
          <${LengthField} label="Space above description" ...${bind('entry.descriptionGap')} />
          <${LengthField} label="Gap between entries" ...${bind('entry.entryGap')} />
        </div>
      <//>

      <${Group} id="design.list" title="Bullet lists" className="card">
        <div class="grid">
          <${SelectField} label="Bullet symbol" options=${BULLETS} ...${bind('list.symbol')} />
          ${Li.symbol === 'custom'
            ? html`<${Field} label="Custom symbol (LaTeX)"
                ><${TextInput} value=${Li.customSymbol} mono placeholder="$\\diamond$" onChange=${(v) => setLayout('list.customSymbol', v)}
              /><//>`
            : null}
          <${NumberField} label="Bullet scale" suffix="×" step=${0.05} min=${0.1} max=${4} ...${bind('list.bulletScale')} />
          <${LengthField} label="Bullet raise" hint="Moves the symbol up (+) or down (−) relative to the text baseline." ...${bind('list.bulletRaise')} />
          <${LengthField} label="Text indent" hint="Left margin → start of the bullet text." min=${0} ...${bind('list.indent')} />
          <${LengthField} label="Bullet → text gap" min=${0} ...${bind('list.labelSep')} />
          <${LengthField} label="Space between bullets" ...${bind('list.itemSep')} />
          <${LengthField} label="Space above list" ...${bind('list.spaceBefore')} />
          <${LengthField} label="Space below list" ...${bind('list.spaceAfter')} />
          <${LengthField} label="Right margin" hint="Narrows bullet text from the right." ...${bind('list.rightMargin')} />
          <${LengthField} label="Column gap" hint="For multi-column list sections." min=${0} ...${bind('list.columnGap')} />
          <${Field} label="Inline separator" hint="For list sections in inline style."
            ><${TextInput} value=${Li.inlineSeparator} onChange=${(v) => setLayout('list.inlineSeparator', v)}
          /><//>
          <${LengthField} label="Inline separator spacing" min=${0} ...${bind('list.inlineSpace')} />
        </div>
      <//>

      <${Group} id="design.skills" title="Skills tables" className="card">
        <div class="grid">
          <${SegmentedField}
            label="Layout"
            wide
            options=${[
              { value: 'table', label: 'Aligned columns' },
              { value: 'inline', label: 'Inline (Label: values)' },
            ]}
            ...${bind('skills.layout')}
          />
          ${Sk.layout === 'table' ? html`<${LengthField} label="Label column width" min=${0} ...${bind('skills.labelWidth')} />` : null}
          <${LengthField} label="Label → value gap" ...${bind('skills.columnGap')} />
          <${LengthField} label="Row gap" ...${bind('skills.rowGap')} />
          <${ToggleField} label="Bold labels" ...${bind('skills.labelBold')} />
          <${Field} label="Label suffix"><${TextInput} value=${Sk.labelSuffix} onChange=${(v) => setLayout('skills.labelSuffix', v)} placeholder=":" /><//>
        </div>
      <//>

      <${Group} id="design.links" title="Links" className="card" defaultOpen=${false}>
        <div class="grid">
          <${SegmentedField}
            label="Link style"
            wide
            options=${[
              { value: 'plain', label: 'Plain (clickable)' },
              { value: 'color', label: 'Colored' },
              { value: 'underline', label: 'Underlined' },
            ]}
            ...${bind('links.style')}
          />
        </div>
      <//>

      <${Group} id="design.advanced" title="Advanced" className="card" defaultOpen=${false}>
        <div class="grid">
          <${ToggleField}
            label="Raw LaTeX in text fields"
            wide
            hint="Off: text is escaped and supports **bold**/*italic*. On: every field is pasted into LaTeX verbatim."
            ...${bind('advanced.rawText')}
          />
          <${Field} label="Custom preamble" wide hint="Inserted right before \\begin{document}; can \\renewcommand any rb… macro.">
            <${AutoTextarea}
              mono
              rows=${4}
              value=${layout.advanced.preamble}
              placeholder="% e.g. \\usepackage{fontawesome5}"
              onChange=${(v) => setLayout('advanced.preamble', v)}
            />
          <//>
        </div>
      <//>
    </div>
  `;
}

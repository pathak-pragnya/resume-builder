import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { html } from '../html.js';
import { Icon } from '../icons.js';
import { BULLET_FORMATS, bulletFormatActive, formatBulletSelection } from '../formatting.js';
import { TYPE_LABELS, cloneEntry, cloneSection, entryBuckets, moveEntryGroup, moveEntryToGroup, newEntry, newSection, placeEntryGroup, removeEntryGroup, sectionCategory, switchSectionType } from '../model.js';
import { moveItem, uid, usePersistentState } from '../util.js';
import {
  AutoTextarea,
  ColorField,
  Field,
  Group,
  IconButton,
  LengthField,
  NumberField,
  SegmentedField,
  SelectField,
  TextInput,
  ToggleField,
} from './fields.js';

const MARKUP_HINT = 'Supports **bold**, *italic*, __underline__, `code` and [label](url). Type -- for an en dash.';

export function ContentPanel({ doc, update }) {
  const firstVisible = doc.sections.find((s) => !s.hidden)?.id;
  return html`
    <div class="panel-scroll content-panel">
      <${HeaderEditor} header=${doc.header} update=${update} />
      ${doc.sections.map(
        (section, index) => html`<${SectionCard}
          key=${section.id}
          section=${section}
          index=${index}
          total=${doc.sections.length}
          isFirst=${section.id === firstVisible}
          layout=${doc.layout}
          update=${update}
        />`,
      )}
      <${AddSection} update=${update} />
      <p class="hint hint--center">${MARKUP_HINT}</p>
    </div>
  `;
}

// ---------------------------------------------------------------- header

function HeaderEditor({ header, update }) {
  const set = (key) => (value) => update((d) => (d.header[key] = value), `header.${key}`);
  const editContact = (id, key, value, coalesce = true) =>
    update((d) => {
      const contact = d.header.contacts.find((c) => c.id === id);
      if (contact) contact[key] = value;
    }, coalesce ? `contact.${id}.${key}` : null);
  const move = (index, delta) => update((d) => moveItem(d.header.contacts, index, delta));
  const remove = (id) => update((d) => (d.header.contacts = d.header.contacts.filter((c) => c.id !== id)));
  const add = () => update((d) => d.header.contacts.push({ id: uid('c'), text: '', url: '', newLine: false }));

  return html`
    <${Group} id="content.header" title="Header" className="card">
      <div class="grid">
        <${Field} label="Name"><${TextInput} value=${header.name} onChange=${set('name')} placeholder="Your Name" /><//>
        <${Field} label="Headline"><${TextInput} value=${header.headline} onChange=${set('headline')} placeholder="e.g. Software Engineer" /><//>
      </div>
      <div class="subhead">
        Contact line
        <span class="subhead__hint">Emails and URLs link automatically; add a link to override.</span>
      </div>
      <div class="rows">
        ${header.contacts.map(
          (c, i) => html`
            <div class="row row--contact" key=${c.id}>
              <${TextInput} value=${c.text} onChange=${(v) => editContact(c.id, 'text', v)} placeholder="you@email.com" />
              <${TextInput} value=${c.url} onChange=${(v) => editContact(c.id, 'url', v)} placeholder="link (optional)" mono />
              <div class="row__actions">
                <${IconButton}
                  icon="newline"
                  active=${c.newLine}
                  title=${c.newLine ? 'Starts a new line (click to keep on same line)' : 'Start a new line before this item'}
                  onClick=${() => editContact(c.id, 'newLine', !c.newLine, false)}
                />
                <${IconButton} icon="arrow-up" title="Move up" disabled=${i === 0} onClick=${() => move(i, -1)} />
                <${IconButton} icon="arrow-down" title="Move down" disabled=${i === header.contacts.length - 1} onClick=${() => move(i, 1)} />
                <${IconButton} icon="x" title="Remove" onClick=${() => remove(c.id)} />
              </div>
            </div>
          `,
        )}
      </div>
      <button type="button" class="btn btn--ghost btn--sm" onClick=${add}><${Icon} name="plus" size=${14} /> Add contact item</button>
    <//>
  `;
}

// --------------------------------------------------------------- sections

function SectionCard({ section, index, total, isFirst, layout, update }) {
  const [open, setOpen] = usePersistentState(`rb.sec.${section.id}`, true);
  const id = section.id;
  const edit = (mutate, key = null) =>
    update((d) => {
      const s = d.sections.find((x) => x.id === id);
      if (s) mutate(s);
    }, key ? `${id}.${key}` : null);
  const move = (delta) => update((d) => moveItem(d.sections, d.sections.findIndex((x) => x.id === id), delta));
  const duplicate = () =>
    update((d) => {
      const i = d.sections.findIndex((x) => x.id === id);
      const copy = cloneSection(d.sections[i]);
      copy.title = `${copy.title} (copy)`;
      d.sections.splice(i + 1, 0, copy);
    });
  const remove = () => {
    const name = section.title || TYPE_LABELS[section.type];
    if (window.confirm(`Delete the “${name}” section? (Undo with ⌘Z)`)) {
      update((d) => (d.sections = d.sections.filter((x) => x.id !== id)));
    }
  };

  let body = null;
  if (['entries', 'education', 'work'].includes(section.type)) body = html`<${EntriesEditor} section=${section} layout=${layout} update=${update} />`;
  else if (section.type === 'skills') body = html`<${SkillsEditor} section=${section} edit=${edit} />`;
  else if (section.type === 'text')
    body = html`<${AutoTextarea}
      value=${section.text}
      rows=${3}
      placeholder="Write a paragraph. Leave a blank line to start a new paragraph."
      onChange=${(v) => edit((s) => (s.text = v), 'text')}
    />`;
  else if (section.type === 'list')
    body = html`<${BulletList}
      items=${section.items}
      idPrefix=${id}
      placeholder="List item"
      addLabel="Add item"
      onChange=${(items, key) => edit((s) => (s.items = items), key)}
    />`;
  else
    body = html`<${AutoTextarea}
      value=${section.latex}
      rows=${4}
      mono
      placeholder="Raw LaTeX inserted as-is"
      onChange=${(v) => edit((s) => (s.latex = v), 'latex')}
    />`;

  return html`
    <section class=${`card ${section.hidden ? 'is-hidden' : ''}`}>
      <header class="card__header">
        <button type="button" class="card__toggle" onClick=${() => setOpen(!open)} title=${open ? 'Collapse' : 'Expand'}>
          <${Icon} name=${open ? 'chevron-down' : 'chevron-right'} size=${15} />
        </button>
        <input
          class="card__title"
          value=${section.title}
          placeholder="Section title"
          aria-label="Section title"
          spellcheck=${false}
          onInput=${(e) => edit((s) => (s.title = e.currentTarget.value), 'title')}
        />
        <${SectionColor} section=${section} layout=${layout} edit=${edit} />
        <span class="chip">${TYPE_LABELS[section.type]}</span>
        <div class="card__actions">
          <${IconButton} icon="arrow-up" title="Move section up" disabled=${index === 0} onClick=${() => move(-1)} />
          <${IconButton} icon="arrow-down" title="Move section down" disabled=${index === total - 1} onClick=${() => move(1)} />
          <${IconButton}
            icon=${section.hidden ? 'eye-off' : 'eye'}
            title=${section.hidden ? 'Hidden from PDF (click to show)' : 'Hide from PDF'}
            active=${section.hidden}
            onClick=${() => edit((s) => (s.hidden = !s.hidden))}
          />
          <${IconButton} icon="copy" title="Duplicate section" onClick=${duplicate} />
          <${IconButton} icon="trash" title="Delete section" danger onClick=${remove} />
        </div>
      </header>
      ${open
        ? html`<div class="card__body">
            <div class="grid">
              <${SelectField} label="Section type" value=${sectionCategory(section)}
                options=${[{ value: 'education', label: 'Education' }, { value: 'work', label: 'Work Experience' }, { value: 'skills', label: 'Skills' }, { value: 'misc', label: 'Misc' }]}
                onChange=${(type) => edit((s) => switchSectionType(s, type === 'misc' ? s.miscType || 'entries' : type))} />
              ${sectionCategory(section) === 'misc' ? html`<${SelectField} label="Content format" value=${section.type}
                options=${['entries', 'text', 'list', 'raw'].map((value) => ({ value, label: TYPE_LABELS[value] }))}
                onChange=${(type) => edit((s) => switchSectionType(s, type))} />` : null}
            </div>
            ${body}
            <${SectionOverrides} section=${section} layout=${layout} edit=${edit} isFirst=${isFirst} />
          </div>`
        : null}
    </section>
  `;
}

// Axial hex coordinates produce a compact color wheel with 91 swatches.
function hexColorRows() {
  const radius = 5;
  return Array.from({ length: radius * 2 + 1 }, (_, index) => {
    const r = index - radius;
    const start = Math.max(-radius, -r - radius);
    const end = Math.min(radius, -r + radius);
    return Array.from({ length: end - start + 1 }, (_, column) => {
      const x = start + column + r / 2;
      const y = r * Math.sqrt(3) / 2;
      const distance = Math.hypot(x, y) / radius;
      const hue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      const lightness = 1 - distance / 2;
      const amplitude = distance * Math.min(lightness, 1 - lightness);
      const channel = (n) => {
        const k = (n + hue / 30) % 12;
        return Math.round(255 * (lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
      };
      const color = `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
      return [color, color];
    });
  });
}

const HEX_COLOR_ROWS = hexColorRows();
const NEUTRAL_COLORS = Array.from({ length: 11 }, (_, index) => {
  const channel = Math.round(index * 255 / 10).toString(16).padStart(2, '0');
  return [`Grey ${index * 10}%`, `#${channel.repeat(3)}`.toUpperCase()];
});
const HEADING_PRESETS = [
    ['Charcoal', '#111111'], ['Navy', '#14213D'], ['Teal', '#0F766E'],
    ['Burgundy', '#7F1D1D'], ['Forest', '#2F5D3A'], ['Slate', '#475569'],
    ['Blue', '#1D4ED8'], ['Indigo', '#4338CA'], ['Purple', '#7E22CE'],
    ['Violet', '#6D28D9'], ['Magenta', '#A21CAF'], ['Rose', '#BE123C'],
    ['Red', '#B91C1C'], ['Orange', '#C2410C'], ['Amber', '#B45309'],
    ['Olive', '#4D7C0F'], ['Emerald', '#047857'], ['Cyan', '#0E7490'],
];

function SectionColor({ section, layout, edit }) {
  const [target, setTarget] = useState('heading');
  const heading = section.style?.headingColor || layout.colors.heading;
  const separator = section.style?.ruleColor || section.style?.headingColor || layout.colors.rule;
  const key = target === 'heading' ? 'headingColor' : 'ruleColor';
  const value = target === 'heading' ? heading : separator;
  const set = overrideSetter(edit)(key);
  const swatch = ([name, color]) => {
    const selected = value.toUpperCase() === color;
    const luminance = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
    const ink = luminance[0] * 0.299 + luminance[1] * 0.587 + luminance[2] * 0.114 > 150 ? '#111111' : '#FFFFFF';
    return html`<button type="button" class="heading-color__swatch"
      style=${{ background: color, color: ink }} title=${`${name} (${color})`}
      aria-label=${name === color ? color : `${name} ${color}`} aria-pressed=${selected}
      onClick=${() => set(color)}>${selected ? html`<${Icon} name="check" size=${13} />` : null}</button>`;
  };
  return html`
    <details class="heading-color" onKeyDown=${(e) => {
      if (e.key === 'Escape') {
        e.currentTarget.open = false;
        e.currentTarget.querySelector('summary').focus();
      }
    }}>
      <summary class="heading-color__toggle" title="Heading & separator colors" aria-label=${`Heading and separator colors for ${section.title || 'section'}`}>
        <span class="palette-dot" style=${{ background: heading }}></span>
        <span class="heading-color__rule" style=${{ background: separator }}></span>
      </summary>
      <div class="heading-color__panel">
        <${SegmentedField} label="Apply color to" value=${target} onChange=${setTarget}
          options=${[{ value: 'heading', label: 'Heading' }, { value: 'separator', label: 'Separator' }]} />
        <${ColorField} label=${target === 'heading' ? 'Heading color' : 'Separator color'} value=${value} onChange=${set} />
        <div class="heading-color__palette" role="group" aria-label=${`${target} color palette`}>
          <div class="heading-color__honeycomb">
            ${HEX_COLOR_ROWS.map((row) => html`<div class="heading-color__row">${row.map(swatch)}</div>`)}
          </div>
          <div class="heading-color__row">${NEUTRAL_COLORS.map(swatch)}</div>
          <div class="heading-color__presets">${HEADING_PRESETS.map(swatch)}</div>
        </div>
        <button type="button" class="btn btn--ghost btn--xs" disabled=${!section.style?.[key]} onClick=${() => set(null)}>
          ${target === 'heading' ? 'Use Design color' : 'Reset separator color'}
        </button>
        ${target === 'separator' ? html`<p class="hint">By default, the separator follows your section heading override, or the Design rule color.</p>` : null}
      </div>
    </details>
  `;
}

function overrideSetter(edit) {
  return (key) => (value) =>
    edit((s) => {
      s.style = s.style || {};
      if (value == null || value === false || value === '') delete s.style[key];
      else s.style[key] = value;
    }, `style.${key}`);
}

function SectionOverrides({ section, layout, edit, isFirst }) {
  const st = section.style || {};
  const set = overrideSetter(edit);
  const count = Object.keys(st).length + (section.showHeading ? 0 : 1);
  const L = layout;
  const type = section.type;
  return html`
    <${Group}
      id=${`sec.${section.id}.layout`}
      title="Section spacing & layout"
      badge=${count ? `${count} override${count > 1 ? 's' : ''}` : null}
      defaultOpen=${false}
      className="group--nested"
    >
      <p class="hint">Empty fields inherit the Design tab value shown in grey. Negative values tighten spacing.</p>
      <div class="grid">
        <${ToggleField} label="Show heading" value=${section.showHeading} onChange=${(v) => edit((s) => (s.showHeading = v))} />
        <${ToggleField} label="Start on new page" value=${!!st.pageBreakBefore} onChange=${set('pageBreakBefore')} />
        <${LengthField}
          label="Space above section"
          value=${st.spaceBefore ?? null}
          inherit=${isFirst ? '0pt' : L.section.spaceBefore}
          nullable
          onChange=${set('spaceBefore')}
          hint=${isFirst ? 'First section: the header gap already separates it from the header.' : null}
        />
        <${LengthField} label="Heading → content" value=${st.spaceAfter ?? null} inherit=${L.section.spaceAfter} nullable onChange=${set('spaceAfter')} />
        <${LengthField} label="Content indent" value=${st.contentIndent ?? null} inherit=${L.section.contentIndent} nullable onChange=${set('contentIndent')} />
        <${NumberField}
          label="Body text size"
          suffix="pt"
          step=${0.25}
          min=${4}
          max=${40}
          value=${st.bodySize ?? null}
          inherit=${L.typography.bodySize}
          nullable
          onChange=${set('bodySize')}
        />
        ${['entries', 'education', 'work'].includes(type)
          ? html`
              <${LengthField} label="Gap between entries" value=${st.entryGap ?? null} inherit=${L.entry.entryGap} nullable onChange=${set('entryGap')} />
              <${LengthField} label="Bullet spacing" value=${st.itemSep ?? null} inherit=${L.list.itemSep} nullable onChange=${set('itemSep')} />
              <${LengthField} label="Bullet text indent" value=${st.listIndent ?? null} inherit=${L.list.indent} nullable onChange=${set('listIndent')} />
            `
          : null}
        ${type === 'skills'
          ? html`
              <${SelectField} label="Skills layout" value=${st.skillsLayout || L.skills.layout}
                options=${[{ value: 'table', label: 'Label and values in columns' }, { value: 'inline', label: 'Inline labels' }]}
                onChange=${set('skillsLayout')} />
              <${ToggleField} label="Bold labels" value=${st.labelBold ?? L.skills.labelBold}
                onChange=${(v) => edit((s) => { s.style = s.style || {}; s.style.labelBold = v; }, 'style.labelBold')} />
              <${Field} label="Label suffix" hint="Leave empty for labels without a colon.">
                <${TextInput} value=${st.labelSuffix ?? L.skills.labelSuffix}
                  onChange=${(v) => edit((s) => { s.style = s.style || {}; s.style.labelSuffix = v; }, 'style.labelSuffix')} />
              <//>
              <${LengthField} label="Label column width" value=${st.labelWidth ?? null} inherit=${L.skills.labelWidth} nullable onChange=${set('labelWidth')} />
              <${LengthField} label="Column gap" value=${st.skillColumnGap ?? null} inherit=${L.skills.columnGap} nullable onChange=${set('skillColumnGap')} />
              <${LengthField} label="Row gap" value=${st.rowGap ?? null} inherit=${L.skills.rowGap} nullable onChange=${set('rowGap')} />
            `
          : null}
        ${type === 'list'
          ? html`
              <${SegmentedField}
                label="List style"
                value=${st.listStyle || 'bullets'}
                options=${[
                  { value: 'bullets', label: 'Bullets' },
                  { value: 'inline', label: 'Inline' },
                ]}
                onChange=${(v) => set('listStyle')(v === 'bullets' ? null : v)}
              />
              ${st.listStyle !== 'inline'
                ? html`
                    <${NumberField}
                      label="Columns"
                      step=${1}
                      min=${1}
                      max=${6}
                      digits=${0}
                      value=${st.columns ?? null}
                      inherit=${1}
                      nullable
                      onChange=${(v) => set('columns')(v === 1 ? null : v)}
                    />
                    <${LengthField} label="Column gap" value=${st.columnGap ?? null} inherit=${L.list.columnGap} nullable onChange=${set('columnGap')} />
                    <${LengthField} label="Bullet spacing" value=${st.itemSep ?? null} inherit=${L.list.itemSep} nullable onChange=${set('itemSep')} />
                    <${LengthField} label="Bullet text indent" value=${st.listIndent ?? null} inherit=${L.list.indent} nullable onChange=${set('listIndent')} />
                  `
                : null}
            `
          : null}
        <${LengthField}
          label="Extra space below"
          value=${st.extraSpaceAfter ?? null}
          inherit="0pt"
          nullable
          onChange=${set('extraSpaceAfter')}
        />
      </div>
    <//>
  `;
}

function AddSection({ update }) {
  const options = [
    ['education', 'Education', 'Schools, degrees and dates'],
    ['work', 'Work Experience', 'Job titles, companies and dates'],
    ['skills', 'Skills', 'Skills, languages and tools'],
    ['entries', 'Misc entries', 'Experience and projects'],
    ['text', 'Paragraph', 'Summary or objective'],
    ['list', 'List', 'Bullets, columns or inline'],
    ['raw', 'Raw LaTeX', 'Anything custom'],
  ];
  return html`
    <div class="add-section">
      <div class="add-section__label">Add a section</div>
      <div class="add-section__grid">
        ${options.map(
          ([type, label, desc]) => html`<button type="button" class="add-tile" onClick=${() => update((d) => d.sections.push(newSection(type)))}>
            <span class="add-tile__title"><${Icon} name="plus" size=${13} /> ${label}</span>
            <span class="add-tile__desc">${desc}</span>
          </button>`,
        )}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------- entries

function EntriesEditor({ section, layout, update }) {
  const sectionId = section.id;
  const dragging = useRef(null);
  const focusGroup = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const buckets = entryBuckets(section);
  useEffect(() => {
    if (!focusGroup.current) return;
    const input = document.querySelector(`[data-entry-group-title="${focusGroup.current}"]`);
    if (input) { input.focus(); input.select(); focusGroup.current = null; }
  }, [section.entryGroups]);
  const editSection = (mutate, key = null) =>
    update((d) => {
      const s = d.sections.find((x) => x.id === sectionId);
      if (s) mutate(s);
    }, key ? `${sectionId}.${key}` : null);
  const add = (groupId = '') => editSection((s) => s.entries.push({ ...newEntry(), groupId }));
  const addGroup = () => {
    const id = uid('grp');
    focusGroup.current = id;
    editSection((s) => { s.entryGroups = [...(s.entryGroups || []), { id, title: 'New subsection' }]; });
  };
  const clearDrag = () => { dragging.current = null; setDraggingId(null); setDropTarget(null); };
  const dragStart = (entry) => (e) => {
    e.stopPropagation();
    dragging.current = { kind: 'entry', id: entry.id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-resume-entry', JSON.stringify({ sectionId, entryId: entry.id }));
    e.dataTransfer.setData('text/plain', entry.title || 'Entry');
    setDraggingId(`entry:${entry.id}`);
  };
  const groupDragStart = (bucket) => (e) => {
    e.stopPropagation();
    dragging.current = { kind: 'group', id: bucket.id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-resume-entry-group', JSON.stringify({ sectionId, groupId: bucket.id }));
    e.dataTransfer.setData('text/plain', bucket.title || 'Subsection');
    setDraggingId(`group:${bucket.id}`);
  };
  const isAfter = (e) => e.clientY > e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
  const markTarget = (e, target) => {
    if (!dragging.current) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget((old) => JSON.stringify(old) === JSON.stringify(target) ? old : target);
  };
  const drop = (e, groupId, beforeId = null) => {
    if (dragging.current?.kind !== 'entry') return;
    e.preventDefault(); e.stopPropagation();
    const entryId = dragging.current.id;
    editSection((s) => moveEntryToGroup(s, entryId, groupId, beforeId));
    clearDrag();
  };
  const dropGroup = (e, groupId) => {
    if (dragging.current?.kind !== 'group') return;
    e.preventDefault(); e.stopPropagation();
    const sourceId = dragging.current.id;
    const after = isAfter(e);
    editSection((s) => placeEntryGroup(s, sourceId, groupId, after));
    clearDrag();
  };
  const entryRow = (entry, index, bucket) => {
    const after = (e) => e.clientY > e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
    const target = dropTarget?.entryId === entry.id;
    return html`<div key=${entry.id}
      class=${`entry-drop ${draggingId === `entry:${entry.id}` ? 'is-dragging' : ''} ${target ? dropTarget.after ? 'is-drop-after' : 'is-drop-before' : ''}`}
      onDragOver=${(e) => { if (dragging.current?.kind === 'entry') markTarget(e, { groupId: bucket.id, entryId: entry.id, after: after(e) }); }}
      onDrop=${(e) => drop(e, bucket.id, after(e) ? bucket.entries[index + 1]?.id || null : entry.id)}>
      <${EntryCard} entry=${entry} index=${index} total=${bucket.entries.length} section=${section} layout=${layout} update=${update}
        onDragStart=${dragStart(entry)} onDragEnd=${clearDrag} />
    </div>`;
  };
  const addLabel = section.type === 'education' ? 'Add school' : section.type === 'work' ? 'Add role' : 'Add entry';
  return html`
    <div class="entries">
      ${section.entryGroups?.length ? html`<p class="hint">Drag entries into subsections. Drag subsection grips or use their arrows to reorder them, including Ungrouped.</p>` : null}
      ${buckets.map((bucket, groupIndex) => {
        if (!bucket.id && !section.entryGroups?.length) return bucket.entries.map((entry, index) => entryRow(entry, index, bucket));
        return html`<section key=${bucket.id || 'ungrouped'}
          class=${`entry-group ${!bucket.id ? 'entry-group--ungrouped' : ''} ${draggingId === `group:${bucket.id}` ? 'is-dragging' : ''} ${dropTarget?.groupId === bucket.id && !dropTarget.entryId ? dropTarget.groupDrop ? dropTarget.after ? 'is-group-drop-after' : 'is-group-drop-before' : 'is-drop-target' : ''}`}
          onDragOver=${(e) => markTarget(e, dragging.current?.kind === 'group' ? { groupId: bucket.id, groupDrop: true, after: isAfter(e) } : { groupId: bucket.id })}
          onDrop=${(e) => dragging.current?.kind === 'group' ? dropGroup(e, bucket.id) : drop(e, bucket.id)}
          onDragLeave=${(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }}>
          <header class="entry-group__header">
            <button type="button" class="icon-btn entry__drag-handle" draggable=${true} title="Drag to reorder subsection" aria-label=${`Drag ${bucket.title || 'subsection'} to reorder`}
              onDragStart=${groupDragStart(bucket)} onDragEnd=${clearDrag}><${Icon} name="grip" size=${13} /></button>
            <${Icon} name="folder" size=${14} />
            ${bucket.id ? html`<input class="entry-group__title" aria-label="Subsection title" placeholder="Subsection title"
              data-entry-group-title=${bucket.id} value=${bucket.title}
              onInput=${(e) => { const title = e.currentTarget.value; editSection((s) => { const group = s.entryGroups.find((g) => g.id === bucket.id); if (group) group.title = title; }, `group.${bucket.id}.title`); }} />`
              : html`<span class="entry-group__label">Ungrouped</span>`}
            <span class="badge badge--subtle">${bucket.entries.length}</span>
            <div class="row__actions">
              <${IconButton} icon="arrow-up" title="Move subsection up" disabled=${groupIndex === 0} onClick=${() => editSection((s) => moveEntryGroup(s, bucket.id, -1))} />
              <${IconButton} icon="arrow-down" title="Move subsection down" disabled=${groupIndex === buckets.length - 1} onClick=${() => editSection((s) => moveEntryGroup(s, bucket.id, 1))} />
              ${bucket.id ? html`<${IconButton} icon="trash" title="Remove subsection (keep entries)" danger onClick=${() => editSection((s) => removeEntryGroup(s, bucket.id))} />` : null}
            </div>
          </header>
          ${bucket.entries.map((entry, index) => entryRow(entry, index, bucket))}
          ${!bucket.entries.length ? html`<div class="entry-group__empty">Drop entries here${bucket.id ? ' to group them' : ' to remove grouping'}.</div>` : null}
          ${bucket.id ? html`<button type="button" class="btn btn--ghost btn--xs" onClick=${() => add(bucket.id)}><${Icon} name="plus" size=${13} /> ${addLabel}</button>` : null}
        </section>`;
      })}
      <div class="entries__controls">
        <button type="button" class="btn btn--ghost btn--sm" onClick=${() => add()}><${Icon} name="plus" size=${14} /> ${addLabel}</button>
        <button type="button" class="btn btn--ghost btn--sm" onClick=${addGroup}><${Icon} name="folder" size=${14} /> Add subsection</button>
      </div>
    </div>
  `;
}

function EntryCard({ entry, index, total, section, layout, update, onDragStart, onDragEnd }) {
  const [open, setOpen] = usePersistentState(`rb.ent.${entry.id}`, index === 0);
  const sectionId = section.id;
  const edit = (mutate, key = null) =>
    update((d) => {
      const s = d.sections.find((x) => x.id === sectionId);
      const e = s?.entries.find((x) => x.id === entry.id);
      if (e) mutate(e, s);
    }, key ? `${entry.id}.${key}` : null);
  const setField = (key) => (value) => edit((e) => (e[key] = value), key);
  const set = overrideSetter(edit);
  const move = (delta) => edit((e, s) => {
    const peers = entryBuckets(s).find((bucket) => bucket.entries.some((item) => item.id === e.id)).entries;
    const other = peers[peers.indexOf(e) + delta];
    if (!other) return;
    const from = s.entries.indexOf(e), to = s.entries.indexOf(other);
    [s.entries[from], s.entries[to]] = [s.entries[to], s.entries[from]];
  });
  const duplicate = () => edit((e, s) => s.entries.splice(s.entries.indexOf(e) + 1, 0, cloneEntry(e)));
  const remove = () => edit((e, s) => (s.entries = s.entries.filter((x) => x !== e)));

  const st = entry.style || {};
  const overrides = Object.keys(st).length;
  const oneLine = section.type !== 'work' && layout.entry.layout === 'oneLine';
  const education = section.type === 'education';
  const work = section.type === 'work';

  return html`
    <div class=${`entry ${entry.hidden ? 'is-hidden' : ''} ${open ? 'is-open' : ''}`}>
      <div class="entry__header" onClick=${() => setOpen(!open)}>
        <button type="button" class="icon-btn entry__drag-handle" draggable=${true} title="Drag to move or group this entry" aria-label="Drag to move entry"
          onClick=${(e) => e.stopPropagation()} onDragStart=${onDragStart} onDragEnd=${onDragEnd}><${Icon} name="grip" size=${13} /></button>
        <button type="button" class="card__toggle" aria-label=${open ? 'Collapse entry' : 'Expand entry'} aria-expanded=${open} onClick=${(e) => { e.stopPropagation(); setOpen(!open); }}>
          <${Icon} name=${open ? 'chevron-down' : 'chevron-right'} size=${14} className="entry__chevron" />
        </button>
        <input
          class="card__title entry__summary"
          value=${entry.title}
          placeholder=${education ? 'School name' : work ? 'Job title' : 'Untitled entry'}
          aria-label=${education ? 'School name' : work ? 'Job title' : 'Entry title'}
          title=${(work ? entry.company : entry.subtitle) || 'Edit entry title'}
          onClick=${(e) => e.stopPropagation()}
          onInput=${(e) => setField('title')(e.currentTarget.value)}
        />
        ${entry.date ? html`<span class="entry__date">${entry.date.replace(/--/g, '–')}</span>` : null}
        ${overrides ? html`<span class="badge badge--subtle" title="Fine-tune overrides">${overrides}</span>` : null}
        <div class="entry__actions" onClick=${(e) => e.stopPropagation()}>
          <${IconButton} icon="arrow-up" title="Move up" size=${13} disabled=${index === 0} onClick=${() => move(-1)} />
          <${IconButton} icon="arrow-down" title="Move down" size=${13} disabled=${index === total - 1} onClick=${() => move(1)} />
          <${IconButton}
            icon=${entry.hidden ? 'eye-off' : 'eye'}
            size=${13}
            active=${entry.hidden}
            title=${entry.hidden ? 'Hidden (click to show)' : 'Hide from PDF'}
            onClick=${() => edit((e) => (e.hidden = !e.hidden))}
          />
          <${IconButton} icon="copy" title="Duplicate" size=${13} onClick=${duplicate} />
          <${IconButton} icon="trash" title="Delete entry" size=${13} danger onClick=${remove} />
        </div>
      </div>
      ${open
        ? html`<div class="entry__body">
            <div class="grid">
              ${section.entryGroups?.length ? html`<${SelectField} label="Subsection" wide
                value=${section.entryGroups.some((group) => group.id === entry.groupId) ? entry.groupId : ''}
                options=${entryBuckets(section).map((group) => ({ value: group.id, label: group.title || 'Untitled subsection' }))}
                onChange=${(groupId) => update((d) => { const s = d.sections.find((item) => item.id === sectionId); if (s) moveEntryToGroup(s, entry.id, groupId); })} />` : null}
              <${Field} label=${education ? 'School name' : work ? 'Job title' : 'Title'}><${TextInput} value=${entry.title} onChange=${setField('title')} placeholder=${education ? 'University / school' : work ? 'e.g. Senior Software Engineer' : 'Role / project'} /><//>
              <${Field} label="Date"><${TextInput} value=${entry.date} onChange=${setField('date')} placeholder="Jan 2022 -- Present" /><//>
              ${work ? html`
                <${Field} label="Company name" hint="Shown in bold, upright text in the PDF."><${TextInput} value=${entry.company} onChange=${setField('company')} placeholder="Company / organization" /><//>
                <${SelectField} label="Company placement" value=${entry.companyPosition}
                  options=${[{ value: 'below', label: 'Below title' }, { value: 'alongside', label: 'Alongside title (Title -- Company)' }]}
                  onChange=${setField('companyPosition')} />
              ` : null}
              ${education ? html`<${Field} label="Degree name"><${TextInput} value=${entry.degree} onChange=${setField('degree')} placeholder="e.g. B.S. in Computer Engineering" /><//>` : null}
              ${!education ? html`<${Field} label="Subtitle"><${TextInput} value=${entry.subtitle} onChange=${setField('subtitle')} placeholder=${work ? 'Team / department (optional)' : 'Company / organization'} /><//>` : null}
              <${Field} label="Location"><${TextInput} value=${entry.location} onChange=${setField('location')} placeholder="City, ST" /><//>
              ${education ? html`
                <${Field} label="GPA / honors" wide hint="Shown on the right of the degree line in the PDF.">
                  <${TextInput} value=${entry.subtitle} onChange=${setField('subtitle')} placeholder="e.g. 9.32/10, Honors, specialization (optional)" />
                <//>
              ` : null}
              ${education ? html`<${Field} label="Courses" wide hint="Optional coursework shown below your degree in the PDF.">
                <${AutoTextarea} value=${entry.courses} onChange=${setField('courses')} placeholder="e.g. Computer Architecture, Operating Systems, VLSI Design" />
              <//>` : null}
              <${Field} label=${education ? 'School link' : 'Title link'} wide hint="Makes the title clickable in the PDF.">
                <${TextInput} value=${entry.url} onChange=${setField('url')} placeholder="https://… (optional)" mono />
              <//>
              <${Field} label="Description" wide hint=${oneLine ? 'Shown below the one-line header.' : 'Optional paragraph shown above the bullets.'}>
                <${AutoTextarea} value=${entry.description} onChange=${setField('description')} placeholder="Optional paragraph" />
              <//>
            </div>
            <div class="subhead">Bullets <span class="subhead__hint">Enter adds a bullet · Backspace on an empty bullet removes it</span></div>
            <${BulletList} items=${entry.bullets} idPrefix=${entry.id} onChange=${(items, key) => edit((e) => (e.bullets = items), key)} />
            <${Group} id=${`ent.${entry.id}.fine`} title="Fine-tune this entry" badge=${overrides ? `${overrides} set` : null} defaultOpen=${false} className="group--nested">
              <div class="grid">
                <${LengthField} label="Extra space above" value=${st.spaceBefore ?? null} inherit="0pt" nullable onChange=${set('spaceBefore')} hint="Added to the normal gap between entries; negative values pull the entry up." />
                <${LengthField} label="Extra space below" value=${st.spaceAfter ?? null} inherit="0pt" nullable onChange=${set('spaceAfter')} />
                <${LengthField}
                  label="Bullet spacing"
                  value=${st.itemSep ?? null}
                  inherit=${section.style?.itemSep ?? layout.list.itemSep}
                  nullable
                  onChange=${set('itemSep')}
                />
                <${ToggleField} label="Start on new page" value=${!!st.pageBreakBefore} onChange=${set('pageBreakBefore')} />
              </div>
            <//>
          </div>`
        : null}
    </div>
  `;
}

// --------------------------------------------------------- bullets & rows

function BulletText({ value, onChange, onKeyDown, placeholder, bulletId }) {
  const container = useRef(null);
  const pendingSelection = useRef(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  useLayoutEffect(() => {
    if (!pendingSelection.current) return;
    const field = container.current?.querySelector('textarea');
    if (!field) return;
    const { start, end } = pendingSelection.current;
    pendingSelection.current = null;
    field.focus();
    field.setSelectionRange(start, end);
  }, [value]);
  const remember = (e) => {
    const { selectionStart: start, selectionEnd: end } = e.currentTarget;
    setSelection((previous) => previous.start === start && previous.end === end ? previous : { start, end });
  };
  const apply = (format) => {
    const field = container.current?.querySelector('textarea');
    if (!field) return;
    const result = formatBulletSelection(field.value, field.selectionStart, field.selectionEnd, format);
    pendingSelection.current = result;
    setSelection({ start: result.start, end: result.end });
    onChange(result.text);
  };
  return html`
    <div class="bullet-editor" ref=${container}>
      <div class="bullet-editor__toolbar" role="group" aria-label="Bullet text formatting">
        ${BULLET_FORMATS.map((format) => html`<button type="button"
          class=${`bullet-editor__format bullet-editor__format--${format.key}`}
          title=${`${format.label} (⌘${format.shortcut.toUpperCase()} / Ctrl+${format.shortcut.toUpperCase()})`}
          aria-label=${format.label} aria-keyshortcuts=${`Meta+${format.shortcut.toUpperCase()} Control+${format.shortcut.toUpperCase()}`}
          aria-pressed=${bulletFormatActive(value, selection.start, selection.end, format)}
          onMouseDown=${(e) => e.preventDefault()} onClick=${() => apply(format)}>${format.glyph}</button>`)}
        <span class="bullet-editor__hint">Select text to format</span>
      </div>
      <${AutoTextarea} value=${value} onChange=${onChange} placeholder=${placeholder} data-bullet=${bulletId}
        onSelect=${remember} onKeyUp=${remember} onClick=${remember}
        onKeyDown=${(e) => {
          const format = (e.metaKey || e.ctrlKey) && !e.altKey && BULLET_FORMATS.find((item) => item.shortcut === e.key.toLowerCase());
          if (format) { e.preventDefault(); e.stopPropagation(); apply(format); }
          else onKeyDown(e);
        }} />
    </div>
  `;
}

export function BulletList({ items, onChange, idPrefix, placeholder = 'Describe an accomplishment…', addLabel = 'Add bullet' }) {
  const pendingFocus = useRef(null);
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const el = document.querySelector(`[data-bullet="${idPrefix}:${pending.index}"]`);
    if (el) {
      el.focus();
      const pos = pending.caret === 'end' ? el.value.length : 0;
      el.setSelectionRange(pos, pos);
    }
  });

  const setAt = (i, value) => {
    const next = items.slice();
    next[i] = value;
    onChange(next, `b${i}`);
  };
  const removeAt = (i) => onChange(items.filter((_, k) => k !== i), null);
  const move = (i, delta) => {
    const next = items.slice();
    moveItem(next, i, delta);
    onChange(next, null);
  };
  const add = () => {
    pendingFocus.current = { index: items.length, caret: 'start' };
    onChange([...items, ''], null);
  };
  const onKeyDown = (i) => (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const el = e.currentTarget;
      const next = items.slice();
      next.splice(i, 1, el.value.slice(0, el.selectionStart).trimEnd(), el.value.slice(el.selectionEnd).trimStart());
      pendingFocus.current = { index: i + 1, caret: 'start' };
      onChange(next, null);
    } else if (e.key === 'Backspace' && e.currentTarget.value === '' && items.length > 1) {
      e.preventDefault();
      pendingFocus.current = { index: Math.max(0, i - 1), caret: 'end' };
      removeAt(i);
    }
  };

  return html`
    <div class="bullets">
      ${items.map(
        (text, i) => html`
          <div class="bullet" key=${i}>
            <span class="bullet__dot">•</span>
            <${BulletText}
              value=${text}
              placeholder=${placeholder}
              bulletId=${`${idPrefix}:${i}`}
              onChange=${(v) => setAt(i, v)}
              onKeyDown=${onKeyDown(i)}
            />
            <div class="row__actions row__actions--hover">
              <${IconButton} icon="arrow-up" title="Move up" size=${13} disabled=${i === 0} onClick=${() => move(i, -1)} />
              <${IconButton} icon="arrow-down" title="Move down" size=${13} disabled=${i === items.length - 1} onClick=${() => move(i, 1)} />
              <${IconButton} icon="x" title="Remove" size=${13} onClick=${() => removeAt(i)} />
            </div>
          </div>
        `,
      )}
      <button type="button" class="btn btn--ghost btn--sm" onClick=${add}><${Icon} name="plus" size=${14} /> ${addLabel}</button>
    </div>
  `;
}

function SkillsEditor({ section, edit }) {
  const editRow = (id, key, value) =>
    edit((s) => {
      const row = s.rows.find((r) => r.id === id);
      if (row) row[key] = value;
    }, `row.${id}.${key}`);
  const move = (i, delta) => edit((s) => moveItem(s.rows, i, delta));
  const remove = (id) => edit((s) => (s.rows = s.rows.filter((r) => r.id !== id)));
  const add = () => edit((s) => s.rows.push({ id: uid('row'), label: '', value: '' }));
  return html`
    <div class="rows">
      <p class="hint">Use a category on the left and comma-separated skills on the right. Table layout keeps wrapped values aligned.</p>
      ${section.rows.map(
        (row, i) => html`
          <div class="row row--skill" key=${row.id}>
            <${Field} label="Category"><${TextInput} value=${row.label} onChange=${(v) => editRow(row.id, 'label', v)} placeholder="e.g. Languages" /><//>
            <${Field} label="Skills / values"><${AutoTextarea} value=${row.value} onChange=${(v) => editRow(row.id, 'value', v)} placeholder="e.g. Python, C++, Verilog" /><//>
            <div class="row__actions">
              <${IconButton} icon="arrow-up" title="Move up" size=${13} disabled=${i === 0} onClick=${() => move(i, -1)} />
              <${IconButton} icon="arrow-down" title="Move down" size=${13} disabled=${i === section.rows.length - 1} onClick=${() => move(i, 1)} />
              <${IconButton} icon="x" title="Remove" size=${13} onClick=${() => remove(row.id)} />
            </div>
          </div>
        `,
      )}
      <button type="button" class="btn btn--ghost btn--sm" onClick=${add}><${Icon} name="plus" size=${14} /> Add row</button>
    </div>
  `;
}

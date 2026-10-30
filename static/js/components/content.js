import { useEffect, useRef } from 'preact/hooks';
import { html } from '../html.js';
import { Icon } from '../icons.js';
import { TYPE_LABELS, cloneEntry, cloneSection, newEntry, newSection } from '../model.js';
import { moveItem, uid, usePersistentState } from '../util.js';
import {
  AutoTextarea,
  Field,
  Group,
  IconButton,
  LengthField,
  NumberField,
  SegmentedField,
  TextInput,
  ToggleField,
} from './fields.js';

const MARKUP_HINT = 'Supports **bold**, *italic*, `code` and [label](url). Type -- for an en dash.';

export function ContentPanel({ doc, update }) {
  const firstVisible = doc.sections.find((s) => !s.hidden)?.id;
  return html`
    <div class="panel-scroll">
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
  if (section.type === 'entries') body = html`<${EntriesEditor} section=${section} layout=${layout} update=${update} />`;
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
          placeholder=${TYPE_LABELS[section.type]}
          spellcheck=${false}
          onInput=${(e) => edit((s) => (s.title = e.currentTarget.value), 'title')}
        />
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
            ${body}
            <${SectionOverrides} section=${section} layout=${layout} edit=${edit} isFirst=${isFirst} />
          </div>`
        : null}
    </section>
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
        ${type === 'entries'
          ? html`
              <${LengthField} label="Gap between entries" value=${st.entryGap ?? null} inherit=${L.entry.entryGap} nullable onChange=${set('entryGap')} />
              <${LengthField} label="Bullet spacing" value=${st.itemSep ?? null} inherit=${L.list.itemSep} nullable onChange=${set('itemSep')} />
              <${LengthField} label="Bullet text indent" value=${st.listIndent ?? null} inherit=${L.list.indent} nullable onChange=${set('listIndent')} />
            `
          : null}
        ${type === 'skills'
          ? html`
              <${LengthField} label="Label column width" value=${st.labelWidth ?? null} inherit=${L.skills.labelWidth} nullable onChange=${set('labelWidth')} />
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
    ['entries', 'Entries', 'Experience, education, projects'],
    ['skills', 'Skills table', 'Label → value rows'],
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
  const editSection = (mutate) =>
    update((d) => {
      const s = d.sections.find((x) => x.id === sectionId);
      if (s) mutate(s);
    });
  const add = () => editSection((s) => s.entries.push(newEntry()));
  return html`
    <div class="entries">
      ${section.entries.map(
        (entry, index) => html`<${EntryCard}
          key=${entry.id}
          entry=${entry}
          index=${index}
          total=${section.entries.length}
          section=${section}
          layout=${layout}
          update=${update}
        />`,
      )}
      <button type="button" class="btn btn--ghost btn--sm" onClick=${add}><${Icon} name="plus" size=${14} /> Add entry</button>
    </div>
  `;
}

function EntryCard({ entry, index, total, section, layout, update }) {
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
  const move = (delta) => edit((e, s) => moveItem(s.entries, s.entries.indexOf(e), delta));
  const duplicate = () => edit((e, s) => s.entries.splice(s.entries.indexOf(e) + 1, 0, cloneEntry(e)));
  const remove = () => edit((e, s) => (s.entries = s.entries.filter((x) => x !== e)));

  const st = entry.style || {};
  const overrides = Object.keys(st).length;
  const summary = [entry.title, entry.subtitle].filter((t) => t.trim()).join(' · ') || 'Untitled entry';
  const oneLine = layout.entry.layout === 'oneLine';

  return html`
    <div class=${`entry ${entry.hidden ? 'is-hidden' : ''} ${open ? 'is-open' : ''}`}>
      <div class="entry__header" onClick=${() => setOpen(!open)}>
        <${Icon} name=${open ? 'chevron-down' : 'chevron-right'} size=${14} className="entry__chevron" />
        <span class="entry__summary">${summary}</span>
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
              <${Field} label="Title"><${TextInput} value=${entry.title} onChange=${setField('title')} placeholder="Role / degree / project" /><//>
              <${Field} label="Date"><${TextInput} value=${entry.date} onChange=${setField('date')} placeholder="Jan 2022 -- Present" /><//>
              <${Field} label="Subtitle"><${TextInput} value=${entry.subtitle} onChange=${setField('subtitle')} placeholder="Company / school" /><//>
              <${Field} label="Location"><${TextInput} value=${entry.location} onChange=${setField('location')} placeholder="City, ST" /><//>
              <${Field} label="Title link" wide hint="Makes the title clickable in the PDF.">
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
            <${AutoTextarea}
              value=${text}
              placeholder=${placeholder}
              data-bullet=${`${idPrefix}:${i}`}
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
      ${section.rows.map(
        (row, i) => html`
          <div class="row row--skill" key=${row.id}>
            <${TextInput} value=${row.label} onChange=${(v) => editRow(row.id, 'label', v)} placeholder="Label" />
            <${AutoTextarea} value=${row.value} onChange=${(v) => editRow(row.id, 'value', v)} placeholder="Comma-separated values" />
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

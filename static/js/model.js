import { clone, deepMerge, uid } from './util.js';

export const SECTION_TYPES = ['entries', 'skills', 'text', 'list', 'raw'];

export const TYPE_LABELS = {
  entries: 'Entries',
  skills: 'Skills table',
  text: 'Paragraph',
  list: 'List',
  raw: 'Raw LaTeX',
};

export function newEntry() {
  return {
    id: uid('ent'),
    title: '',
    subtitle: '',
    date: '',
    location: '',
    url: '',
    description: '',
    bullets: [''],
    hidden: false,
    style: {},
  };
}

export function newSection(type) {
  const base = { id: uid('sec'), type, title: '', hidden: false, showHeading: true, style: {} };
  switch (type) {
    case 'entries':
      return { ...base, title: 'Experience', entries: [newEntry()] };
    case 'skills':
      return { ...base, title: 'Skills', rows: [{ id: uid('row'), label: '', value: '' }] };
    case 'text':
      return { ...base, title: 'Summary', text: '' };
    case 'list':
      return { ...base, title: 'Certifications', items: [''] };
    default:
      return { ...base, title: 'Custom', latex: '% Any LaTeX goes here, e.g.\n\\textbf{Note:} custom content\n' };
  }
}

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const textOf = (item) => (item && typeof item === 'object' ? str(item.text) : str(item));

function hydrateEntry(raw) {
  const e = obj(raw);
  return {
    id: str(e.id) || uid('ent'),
    title: str(e.title),
    subtitle: str(e.subtitle),
    date: str(e.date),
    location: str(e.location),
    url: str(e.url),
    description: str(e.description),
    bullets: arr(e.bullets).map(textOf),
    hidden: e.hidden === true,
    style: obj(e.style),
  };
}

function hydrateSection(raw) {
  const s = obj(raw);
  const section = {
    id: str(s.id) || uid('sec'),
    type: s.type,
    title: str(s.title),
    hidden: s.hidden === true,
    showHeading: s.showHeading !== false,
    style: obj(s.style),
  };
  if (s.type === 'entries') section.entries = arr(s.entries).map(hydrateEntry);
  if (s.type === 'skills') {
    section.rows = arr(s.rows).map((r) => ({ id: str(r?.id) || uid('row'), label: str(r?.label), value: str(r?.value) }));
  }
  if (s.type === 'text') section.text = str(s.text);
  if (s.type === 'list') section.items = arr(s.items).map(textOf);
  if (s.type === 'raw') section.latex = str(s.latex);
  return section;
}

/** Normalize any resume-shaped JSON (saved, imported or sample) into the editor's model. */
export function hydrateResume(raw, defaults) {
  const src = raw && typeof raw === 'object' ? clone(raw) : clone(defaults.resume);
  const header = obj(src.header);
  return {
    version: 1,
    header: {
      name: str(header.name),
      headline: str(header.headline),
      contacts: arr(header.contacts).map((c) => ({
        id: str(c?.id) || uid('c'),
        text: str(c?.text),
        url: str(c?.url),
        newLine: c?.newLine === true,
      })),
    },
    sections: arr(src.sections).filter((s) => SECTION_TYPES.includes(s?.type)).map(hydrateSection),
    layout: deepMerge(defaults.layout, src.layout),
  };
}

/** Deep copy of a section with fresh ids (for duplication). */
export function cloneSection(section) {
  const copy = clone(section);
  copy.id = uid('sec');
  copy.entries?.forEach((e) => (e.id = uid('ent')));
  copy.rows?.forEach((r) => (r.id = uid('row')));
  return copy;
}

export function cloneEntry(entry) {
  return { ...clone(entry), id: uid('ent') };
}

import { clone, deepMerge, uid } from './util.js';

export const SECTION_TYPES = ['education', 'work', 'entries', 'skills', 'text', 'list', 'raw'];

export const TYPE_LABELS = {
  education: 'Education',
  work: 'Work Experience',
  entries: 'Entries',
  skills: 'Skills table',
  text: 'Paragraph',
  list: 'List',
  raw: 'Raw LaTeX',
};

export function newEntry() {
  return {
    id: uid('ent'),
    originId: '',
    groupId: '',
    title: '',
    subtitle: '',
    degree: '',
    courses: '',
    company: '',
    companyPosition: 'below',
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
    case 'education':
      return { ...base, title: 'Education', entries: [newEntry()], entryGroups: [] };
    case 'work':
      return { ...base, title: 'Work Experience', entries: [newEntry()], entryGroups: [] };
    case 'entries':
      return { ...base, title: 'Experience', entries: [newEntry()], entryGroups: [] };
    case 'skills':
      return { ...base, title: 'Skills', style: { skillsLayout: 'table', labelBold: true, labelSuffix: '' },
        rows: ['Skills', 'Languages', 'Tools'].map((label) => ({ id: uid('row'), label, value: '' })) };
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
    originId: str(e.originId),
    groupId: str(e.groupId),
    title: str(e.title),
    subtitle: str(e.subtitle),
    degree: str(e.degree),
    courses: str(e.courses),
    company: str(e.company),
    companyPosition: e.companyPosition === 'alongside' ? 'alongside' : 'below',
    date: str(e.date),
    location: str(e.location),
    url: str(e.url),
    description: str(e.description),
    bullets: arr(e.bullets).map(textOf),
    hidden: e.hidden === true,
    style: obj(e.style),
  };
}

// The resume heading belongs to the section, independently of its form type.
const FORM_KEYS = ['type', 'showHeading', 'style', 'entries', 'entryGroups', 'entryGroupOrder', 'rows', 'text', 'items', 'latex'];
const sectionForm = (section) => Object.fromEntries(FORM_KEYS.filter((key) => key in section).map((key) => [key, clone(section[key])]));
export const sectionCategory = (section) => ['education', 'work', 'skills'].includes(section.type) ? section.type : 'misc';

const hasText = (value) => typeof value === 'string' && value.trim() !== '';
const ENTRY_TEXT_FIELDS = ['title', 'subtitle', 'company', 'degree', 'courses', 'date', 'location', 'url', 'description'];
const entryHasContent = (entry) => ENTRY_TEXT_FIELDS.some((key) => hasText(entry[key])) || entry.bullets?.some(hasText);
const DEFAULT_SKILL_LABELS = ['Skills', 'Languages', 'Tools'];

function formHasContent(form) {
  if (form.entryGroups?.some((group) => hasText(group.title))) return true;
  if (form.entries?.some(entryHasContent) || hasText(form.text) || form.items?.some(hasText)) return true;
  if (form.rows?.some((row, index) => hasText(row.value) || (hasText(row.label) && row.label !== DEFAULT_SKILL_LABELS[index]))) return true;
  // The starter LaTeX comment is a placeholder, not user content.
  return hasText(form.latex) && form.latex !== newSection('raw').latex;
}

function entryLines(entry, includeTitle = true) {
  const heading = [includeTitle ? entry.title : '', entry.company, entry.degree, entry.subtitle].filter(hasText).join(' · ');
  return [heading, [entry.date, entry.location].filter(hasText).join(' · '), entry.url,
    hasText(entry.courses) ? `Courses: ${entry.courses}` : '', entry.description, ...(entry.bullets || [])].filter(hasText);
}

function formLines(form) {
  if (form.entries) return entryBuckets(form).flatMap((group) => [group.id ? group.title : '', ...group.entries.flatMap((entry) => entryLines(entry))].filter(hasText));
  if (form.rows) return form.rows.filter((row) => hasText(row.value) || (hasText(row.label) && !DEFAULT_SKILL_LABELS.includes(row.label)))
    .map((row) => [row.label, row.value].filter(hasText).join(': '));
  if (form.items) return form.items.filter(hasText);
  if (hasText(form.text)) return form.text.split(/\r?\n/).filter(hasText);
  return [];
}

function portEntry(entry, sourceType, targetType, blank) {
  const copy = cloneEntry(entry);
  copy.originId = entry.originId || entry.id;
  if (targetType === 'work' && sourceType === 'entries' && !hasText(copy.company)) {
    copy.company = copy.subtitle;
    copy.subtitle = '';
  }
  if (targetType === 'entries' && ['work', 'education'].includes(sourceType)) {
    copy.subtitle = [sourceType === 'work' ? copy.company : copy.degree, copy.subtitle].filter(hasText).join(' · ');
    if (sourceType === 'education' && hasText(copy.courses)) {
      copy.description = [`Courses: ${copy.courses}`, copy.description].filter(hasText).join('\n\n');
    }
  }
  copy.style = { ...copy.style, ...blank?.style };
  if (blank?.companyPosition === 'alongside') copy.companyPosition = 'alongside';
  if (blank?.hidden) copy.hidden = true;
  return copy;
}

const comparable = (value) => str(value).trim().replace(/\s+/g, ' ').toLowerCase();

/** Keep populated entries intact, filling blank rows and appending missing ones. */
function portMissingEntries(source, destination) {
  const entries = clone(destination.entries);
  const used = new Set();
  for (const incoming of source.entries.filter(entryHasContent)) {
    const origin = incoming.originId || incoming.id;
    let match = entries.findIndex((entry, index) => !used.has(index) &&
      (entry.id === origin || entry.originId === origin || entry.id === incoming.id));
    // Older saved forms have no provenance. Match recognizable entries once.
    if (match < 0 && hasText(incoming.title)) {
      const title = comparable(incoming.title);
      const candidates = entries.map((entry, index) => ({ entry, index })).filter(({ entry, index }) =>
        !used.has(index) && !entry.originId && comparable(entry.title) === title);
      const exact = candidates.find(({ entry }) => comparable(entry.date) === comparable(incoming.date) &&
        comparable(entry.company || entry.subtitle) === comparable(incoming.company || incoming.subtitle));
      if (exact) match = exact.index;
      else if (candidates.length === 1 && source.entries.filter((entry) => comparable(entry.title) === title).length === 1) match = candidates[0].index;
    }
    if (match >= 0) {
      if (!entryHasContent(entries[match])) {
        entries[match] = portEntry(incoming, source.type, destination.type, entries[match]);
        used.add(match);
        continue;
      }
      // Preserve saved text/settings; a blank group can inherit membership.
      if (!entries[match].originId) entries[match].originId = origin;
      if (!entries[match].groupId && incoming.groupId) entries[match].groupId = incoming.groupId;
      used.add(match);
      continue;
    }
    const blank = entries.findIndex((entry, index) => !used.has(index) && !entryHasContent(entry));
    const copy = portEntry(incoming, source.type, destination.type, blank >= 0 ? entries[blank] : null);
    if (blank >= 0) {
      entries[blank] = copy;
      used.add(blank);
    } else {
      used.add(entries.length);
      entries.push(copy);
    }
  }
  return entries;
}

/** Seed blank forms and missing entries without replacing populated content. */
function seedBlankForm(source, destination, isNew) {
  const next = sectionForm(destination);
  const populated = formHasContent(next);
  if (next.entries && source.entries) {
    next.entries = portMissingEntries(source, next);
    const known = new Set((next.entryGroups || []).map((group) => group.id));
    next.entryGroups = [...(next.entryGroups || []), ...clone((source.entryGroups || []).filter((group) => !known.has(group.id)))];
    if (!destination.entryGroups?.length && source.entryGroupOrder) next.entryGroupOrder = clone(source.entryGroupOrder);
  }
  if (populated) return next;
  const sourceStyle = clone(source.style || {});
  next.style = isNew ? { ...next.style, ...sourceStyle } : { ...sourceStyle, ...next.style };
  if (isNew) next.showHeading = source.showHeading;
  const lines = formLines(source);
  if (next.entries) {
    const blankEntries = next.entries;
    if (!source.entries && lines.length) {
      const copy = { ...newEntry(), ...clone(blankEntries[0] || {}) };
      if (source.type === 'text') copy.description = source.text;
      else copy.bullets = clone(lines);
      next.entries = [copy];
    }
  } else if (next.type === 'skills' && lines.length) {
    if (source.entries) {
      next.rows = source.entries.filter(entryHasContent).map((entry) => ({
        id: uid('row'), label: entry.title || 'Details', value: entryLines(entry, false).join('\n'),
      }));
    } else {
      next.rows = clone(next.rows.length ? next.rows : newSection('skills').rows);
      next.rows[0].value = source.type === 'text' ? source.text : lines.join(', ');
    }
  } else if (next.type === 'text' && lines.length) next.text = lines.join('\n\n');
  else if (next.type === 'list' && lines.length) next.items = clone(lines);
  return next;
}

/** Keep each form independently, including when saved and reloaded. */
export function switchSectionType(section, type) {
  if (!SECTION_TYPES.includes(type) || type === section.type) return;
  const variants = section.variants || (section.variants = {});
  variants[section.type] = sectionForm(section);
  const saved = variants[type];
  const next = seedBlankForm(section, saved || newSection(type), !saved);
  FORM_KEYS.forEach((key) => delete section[key]);
  Object.assign(section, sectionForm(next));
  if (sectionCategory(section) === 'misc') section.miscType = type;
}

function hydrateSection(raw, withVariants = true) {
  const s = obj(raw);
  const section = {
    id: str(s.id) || uid('sec'),
    type: s.type,
    title: str(s.title),
    hidden: s.hidden === true,
    showHeading: s.showHeading !== false,
    style: obj(s.style),
  };
  if (['entries', 'education', 'work'].includes(s.type)) {
    section.entries = arr(s.entries).map(hydrateEntry);
    const seen = new Set();
    section.entryGroups = arr(s.entryGroups).filter((group) => {
      if (!group?.id || seen.has(str(group.id))) return false;
      seen.add(str(group.id));
      return true;
    }).map((group) => ({ id: str(group.id), title: str(group.title) }));
    section.entryGroupOrder = orderedEntryGroupIds({ ...section, entryGroupOrder: arr(s.entryGroupOrder) });
  }
  if (s.type === 'skills') {
    section.rows = arr(s.rows).map((r) => ({ id: str(r?.id) || uid('row'), label: str(r?.label), value: str(r?.value) }));
  }
  if (s.type === 'text') section.text = str(s.text);
  if (s.type === 'list') section.items = arr(s.items).map(textOf);
  if (s.type === 'raw') section.latex = str(s.latex);
  if (withVariants) {
    section.miscType = ['entries', 'text', 'list', 'raw'].includes(s.miscType) ? s.miscType : 'entries';
    if (sectionCategory(section) === 'misc') section.miscType = section.type;
    section.variants = {};
    for (const [type, form] of Object.entries(obj(s.variants))) {
      if (SECTION_TYPES.includes(type) && form?.type === type) {
        section.variants[type] = sectionForm(hydrateSection(form, false));
      }
    }
  }
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
    sections: arr(src.sections).filter((s) => SECTION_TYPES.includes(s?.type)).map((s) => hydrateSection(s)),
    layout: deepMerge(defaults.layout, src.layout),
  };
}

/** Deep copy of a section with fresh ids (for duplication). */
export function cloneSection(section) {
  const copy = clone(section);
  copy.id = uid('sec');
  const entryIds = new Map();
  const groupIds = new Map();
  const freshGroupId = (id) => {
    if (!groupIds.has(id)) groupIds.set(id, uid('grp'));
    return groupIds.get(id);
  };
  const freshId = (id) => {
    if (!entryIds.has(id)) entryIds.set(id, uid('ent'));
    return entryIds.get(id);
  };
  const rekey = (entry) => {
    entry.id = freshId(entry.id);
    if (entry.originId) entry.originId = freshId(entry.originId);
    if (entry.groupId) entry.groupId = freshGroupId(entry.groupId);
  };
  copy.entryGroups?.forEach((group) => (group.id = freshGroupId(group.id)));
  if (copy.entryGroupOrder) copy.entryGroupOrder = copy.entryGroupOrder.map((id) => id ? freshGroupId(id) : '');
  copy.entries?.forEach(rekey);
  copy.rows?.forEach((r) => (r.id = uid('row')));
  Object.values(copy.variants || {}).forEach((form) => {
    form.entryGroups?.forEach((group) => (group.id = freshGroupId(group.id)));
    if (form.entryGroupOrder) form.entryGroupOrder = form.entryGroupOrder.map((id) => id ? freshGroupId(id) : '');
    form.entries?.forEach(rekey);
    form.rows?.forEach((r) => (r.id = uid('row')));
  });
  return copy;
}

export function cloneEntry(entry) {
  return { ...clone(entry), id: uid('ent'), originId: '' };
}

/** One display order for grouped entries; unknown groups remain visible. */
function orderedEntryGroupIds(section) {
  const valid = ['', ...(section.entryGroups || []).map((group) => group.id)];
  const order = [...new Set((section.entryGroupOrder || []).filter((id) => valid.includes(id)))];
  if (!order.includes('')) order.unshift('');
  return [...order, ...valid.filter((id) => !order.includes(id))];
}

export function entryBuckets(section) {
  const groups = section.entryGroups || [];
  const known = new Set(groups.map((group) => group.id));
  return orderedEntryGroupIds(section).map((id) => id
    ? { ...groups.find((group) => group.id === id), entries: section.entries.filter((entry) => entry.groupId === id) }
    : { id: '', title: 'Ungrouped', entries: section.entries.filter((entry) => !known.has(entry.groupId)) });
}

export function moveEntryGroup(section, groupId, delta) {
  const order = orderedEntryGroupIds(section);
  const index = order.indexOf(groupId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  section.entryGroupOrder = order;
}

export function placeEntryGroup(section, groupId, targetId, after = false) {
  const order = orderedEntryGroupIds(section);
  if (groupId === targetId || !order.includes(groupId) || !order.includes(targetId)) return;
  order.splice(order.indexOf(groupId), 1);
  order.splice(order.indexOf(targetId) + (after ? 1 : 0), 0, groupId);
  section.entryGroupOrder = order;
}

export function moveEntryToGroup(section, entryId, groupId = '', beforeId = null) {
  const entry = section.entries.find((item) => item.id === entryId);
  if (!entry || beforeId === entryId) return;
  const groupIds = orderedEntryGroupIds(section);
  const bucketId = (item) => groupIds.includes(item.groupId) ? item.groupId : '';
  const target = groupIds.includes(groupId) ? groupId : '';
  const before = section.entries.find((item) => item.id === beforeId);
  if (before && bucketId(before) !== target) return;
  section.entries.splice(section.entries.indexOf(entry), 1);
  entry.groupId = target;
  let index = before ? section.entries.indexOf(before) : -1;
  if (index < 0) {
    const peers = section.entries.filter((item) => bucketId(item) === target);
    if (peers.length) index = section.entries.indexOf(peers[peers.length - 1]) + 1;
    else index = section.entries.findIndex((item) => groupIds.indexOf(bucketId(item)) > groupIds.indexOf(target));
  }
  section.entries.splice(index < 0 ? section.entries.length : index, 0, entry);
}

export function removeEntryGroup(section, groupId) {
  section.entryGroups = (section.entryGroups || []).filter((group) => group.id !== groupId);
  section.entries.forEach((entry) => { if (entry.groupId === groupId) entry.groupId = ''; });
  if (section.entryGroupOrder) section.entryGroupOrder = section.entryGroupOrder.filter((id) => id !== groupId);
}

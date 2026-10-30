import { useCallback, useState } from 'preact/hooks';

export const clone = (value) => structuredClone(value);

export const uid = (prefix = 'id') => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const clamp = (n, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, n));

export function roundTo(n, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

export function fmtNum(n, digits = 3) {
  const rounded = roundTo(n, digits);
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function getIn(obj, path) {
  return path.reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

export function setIn(obj, path, value) {
  let node = obj;
  for (const key of path.slice(0, -1)) {
    if (node[key] == null || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  node[path[path.length - 1]] = value;
}

export function moveItem(list, index, delta) {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
}

/** Fill `value` with any keys missing from `defaults`, dropping type mismatches. */
export function deepMerge(defaults, value) {
  if (Array.isArray(defaults)) return Array.isArray(value) ? value : clone(defaults);
  if (defaults && typeof defaults === 'object') {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = {};
    for (const [key, def] of Object.entries(defaults)) out[key] = deepMerge(def, src[key]);
    return out;
  }
  if (value === undefined || value === null || typeof value !== typeof defaults) return defaults;
  return value;
}

// ---- lengths

export const UNITS = ['pt', 'mm', 'cm', 'in'];

export const STEP = { pt: 0.5, bp: 0.5, mm: 0.25, cm: 0.025, in: 0.01, pc: 0.05, em: 0.05, ex: 0.05 };

const PT_PER = { pt: 1, bp: 72.27 / 72, mm: 72.27 / 25.4, cm: 72.27 / 2.54, in: 72.27, pc: 12 };

export function parseLength(text) {
  if (typeof text !== 'string') return null;
  const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([a-z]{2})\s*$/.exec(text);
  return match ? { value: Number(match[1]), unit: match[2] } : null;
}

export function convertLength(value, from, to) {
  if (from === to || !(from in PT_PER) || !(to in PT_PER)) return value;
  return (value * PT_PER[from]) / PT_PER[to];
}

/** Length in PDF points (1/72 in), the unit pdf.js viewports use. */
export function lengthToBp(text) {
  const parsed = parseLength(text);
  if (!parsed || !(parsed.unit in PT_PER)) return 0;
  return (parsed.value * PT_PER[parsed.unit] * 72) / 72.27;
}

export function formatPt(pt) {
  const mm = (pt * 25.4) / 72.27;
  return `${fmtNum(pt, 1)}pt (${fmtNum(mm, 1)}mm)`;
}

// ---- browser helpers

export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored == null ? initial : JSON.parse(stored);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* storage full or disabled: keep in-memory value */
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}

export function downloadBlob(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isTextTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .CodeMirror'));
}

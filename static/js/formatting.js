export const BULLET_FORMATS = [
  { key: 'bold', label: 'Bold', marker: '**', shortcut: 'b', glyph: 'B' },
  { key: 'italic', label: 'Italic', marker: '*', shortcut: 'i', glyph: 'I' },
  { key: 'underline', label: 'Underline', marker: '__', shortcut: 'u', glyph: 'U' },
];

function markerTokens(text, offset, closing = false) {
  const tokens = [];
  for (const match of text.matchAll(/\*{1,3}|__/g)) {
    let position = offset + match.index;
    const markers = match[0] === '***' ? (closing ? ['*', '**'] : ['**', '*']) : [match[0]];
    for (const marker of markers) {
      tokens.push({ marker, start: position, end: position + marker.length });
      position += marker.length;
    }
  }
  return tokens;
}

function pairedMarker(opening, openingOffset, closing, closingOffset, format) {
  const left = markerTokens(opening, openingOffset).reverse();
  const right = markerTokens(closing, closingOffset, true);
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index].marker !== right[index].marker) return null;
    if (left[index].marker === format.marker) return { left: left[index], right: right[index] };
  }
  return null;
}

function formatBoundary(text, start, end, format) {
  const before = text.slice(0, start).match(/(?:\*|__)+$/)?.[0] || '';
  const after = text.slice(end).match(/^(?:\*|__)+/)?.[0] || '';
  const outside = pairedMarker(before, start - before.length, after, end, format);
  if (outside) return { ...outside, kind: 'outside' };
  const selected = text.slice(start, end);
  const opening = selected.match(/^(?:\*|__)+/)?.[0] || '';
  const closing = selected.match(/(?:\*|__)+$/)?.[0] || '';
  if (opening.length + closing.length <= selected.length) {
    const inside = pairedMarker(opening, start, closing, end - closing.length, format);
    if (inside) return { ...inside, kind: 'inside' };
  }
  return null;
}

export function bulletFormatActive(text, start, end, format) {
  return formatBoundary(text, start, end, format) !== null;
}

/** Toggle markup without losing the selection, so styles can be combined. */
export function formatBulletSelection(text, start, end, format) {
  const marker = format.marker;
  const width = marker.length;
  const boundary = formatBoundary(text, start, end, format);
  if (boundary) {
    const { left, right, kind } = boundary;
    return {
      text: text.slice(0, left.start) + text.slice(left.end, right.start) + text.slice(right.end),
      start: kind === 'outside' ? start - width : start,
      end: kind === 'outside' ? end - width : end - width * 2,
    };
  }
  return { text: text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end), start: start + width, end: end + width };
}

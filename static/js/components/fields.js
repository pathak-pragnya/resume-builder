import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { html } from '../html.js';
import { Icon } from '../icons.js';
import { STEP, UNITS, clamp, convertLength, fmtNum, parseLength, roundTo, uid, usePersistentState } from '../util.js';

const NUDGE_HINT = '↑/↓ to nudge · Shift ×10 · Alt ×0.1 · drag this label to scrub';
const SUPPORTS_FIELD_SIZING = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');

const multiplier = (e) => (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);

function startScrub(event, { get, set, step }) {
  if (event.button !== 0) return;
  event.preventDefault();
  const startX = event.clientX;
  const startValue = get();
  let active = false;
  const onMove = (e) => {
    const dx = e.clientX - startX;
    if (!active && Math.abs(dx) < 3) return;
    active = true;
    set(startValue + Math.round(dx / 4) * step * multiplier(e));
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.body.classList.remove('is-scrubbing');
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  document.body.classList.add('is-scrubbing');
}

export function Field({ label, hint, wide, scrub, className = '', children }) {
  const title = [hint, scrub ? NUDGE_HINT : null].filter(Boolean).join('\n');
  return html`
    <div class=${`field ${wide ? 'field--wide' : ''} ${className}`}>
      <span
        class=${`field__label ${scrub ? 'field__label--scrub' : ''}`}
        title=${title || undefined}
        onPointerDown=${scrub ? (e) => startScrub(e, scrub) : undefined}
        >${label}${hint ? html`<span class="field__hint-dot">?</span>` : null}</span
      >
      <div class="field__control">${children}</div>
    </div>
  `;
}

export function IconButton({ icon, title, onClick, disabled, active, danger, size = 15, className = '' }) {
  return html`<button
    type="button"
    class=${`icon-btn ${active ? 'is-active' : ''} ${danger ? 'icon-btn--danger' : ''} ${className}`}
    title=${title}
    aria-label=${title}
    disabled=${disabled}
    onClick=${onClick}
  >
    <${Icon} name=${icon} size=${size} />
  </button>`;
}

function ResetButton({ onClick, title = 'Clear override (inherit)' }) {
  return html`<${IconButton} icon="reset" size=${13} title=${title} onClick=${onClick} className="reset-btn" />`;
}

export function NumberInput({ value, onChange, step = 1, min = -Infinity, max = Infinity, digits = 3, placeholder, nullable }) {
  const format = (v) => (v == null || Number.isNaN(v) ? '' : fmtNum(v, digits));
  const [text, setText] = useState(format(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value]);

  const emit = (n) => {
    const v = clamp(roundTo(n, digits), min ?? -Infinity, max ?? Infinity);
    onChange(v);
    return v;
  };
  const nudge = (direction, e) => {
    const base = value ?? (Number.parseFloat(placeholder) || 0);
    setText(format(emit(base + direction * step * multiplier(e))));
  };

  return html`
    <div class="num">
      <input
        class="num__input"
        type="text"
        inputmode="decimal"
        spellcheck=${false}
        value=${text}
        placeholder=${placeholder}
        onFocus=${(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur=${() => {
          focused.current = false;
          setText(format(value));
        }}
        onInput=${(e) => {
          const raw = e.currentTarget.value;
          setText(raw);
          if (raw.trim() === '') {
            if (nullable) onChange(null);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n)) emit(n);
        }}
        onKeyDown=${(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            nudge(e.key === 'ArrowUp' ? 1 : -1, e);
          } else if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
      />
      <div class="num__steppers">
        <button type="button" tabindex="-1" aria-label="Increase" onClick=${(e) => nudge(1, e)}>
          <svg viewBox="0 0 10 6" width="8" height="5"><path d="M1 5l4-4 4 4" /></svg>
        </button>
        <button type="button" tabindex="-1" aria-label="Decrease" onClick=${(e) => nudge(-1, e)}>
          <svg viewBox="0 0 10 6" width="8" height="5"><path d="M1 1l4 4 4-4" /></svg>
        </button>
      </div>
    </div>
  `;
}

export function NumberField({ label, hint, value, onChange, step = 0.5, min, max, digits = 3, suffix, wide, inherit, nullable }) {
  const effective = value ?? inherit ?? 0;
  const scrub = {
    get: () => effective,
    set: (v) => onChange(clamp(roundTo(v, digits), min ?? -Infinity, max ?? Infinity)),
    step,
  };
  return html`
    <${Field} label=${label} hint=${hint} wide=${wide} scrub=${scrub} className=${value == null && nullable ? 'is-inherited' : ''}>
      <${NumberInput}
        value=${value}
        onChange=${onChange}
        step=${step}
        min=${min}
        max=${max}
        digits=${digits}
        nullable=${nullable}
        placeholder=${inherit != null ? fmtNum(inherit, digits) : ''}
      />
      ${suffix ? html`<span class="unit-suffix">${suffix}</span>` : null}
      ${nullable && value != null ? html`<${ResetButton} onClick=${() => onChange(null)} />` : null}
    <//>
  `;
}

export function LengthField({ label, hint, value, onChange, inherit, nullable, min, max, wide, units = UNITS }) {
  const parsed = parseLength(value);
  const inherited = parseLength(inherit);
  const unit = parsed?.unit ?? inherited?.unit ?? 'pt';
  const step = STEP[unit] ?? 0.5;
  const number = parsed ? parsed.value : null;
  const inheritedHere = inherited ? convertLength(inherited.value, inherited.unit, unit) : null;
  const unitOptions = units.includes(unit) ? units : [...units, unit];

  const emit = (n) => onChange(n == null ? null : `${fmtNum(clamp(n, min ?? -Infinity, max ?? Infinity), 3)}${unit}`);
  const changeUnit = (next) => {
    const source = parsed ?? inherited ?? { value: 0, unit };
    onChange(`${fmtNum(convertLength(source.value, source.unit, next), 3)}${next}`);
  };
  const scrub = { get: () => number ?? inheritedHere ?? 0, set: emit, step };

  return html`
    <${Field} label=${label} hint=${hint} wide=${wide} scrub=${scrub} className=${number == null && nullable ? 'is-inherited' : ''}>
      <${NumberInput}
        value=${number}
        onChange=${emit}
        step=${step}
        min=${min}
        max=${max}
        nullable=${nullable}
        placeholder=${inheritedHere != null ? fmtNum(inheritedHere, 3) : ''}
      />
      <select class="unit-select" value=${unit} onChange=${(e) => changeUnit(e.currentTarget.value)} title="Unit (value is converted)">
        ${unitOptions.map((u) => html`<option value=${u}>${u}</option>`)}
      </select>
      ${nullable && value != null ? html`<${ResetButton} onClick=${() => onChange(null)} />` : null}
    <//>
  `;
}

export function SelectField({ label, hint, value, onChange, options, wide }) {
  return html`
    <${Field} label=${label} hint=${hint} wide=${wide}>
      <select class="select" value=${value} onChange=${(e) => onChange(e.currentTarget.value)}>
        ${options.map((o) => html`<option value=${o.value} disabled=${o.disabled}>${o.label}</option>`)}
      </select>
    <//>
  `;
}

export function SegmentedField({ label, hint, value, onChange, options, wide }) {
  return html`
    <${Field} label=${label} hint=${hint} wide=${wide}>
      <div class="segmented" role="radiogroup">
        ${options.map(
          (o) => html`<button
            type="button"
            role="radio"
            aria-checked=${o.value === value}
            class=${`segmented__btn ${o.value === value ? 'is-active' : ''}`}
            title=${o.title || o.label}
            onClick=${() => onChange(o.value)}
          >
            ${o.icon ? html`<${Icon} name=${o.icon} size=${14} />` : o.label}
          </button>`,
        )}
      </div>
    <//>
  `;
}

export function Switch({ value, onChange, title }) {
  return html`<button
    type="button"
    role="switch"
    aria-checked=${!!value}
    title=${title}
    class=${`switch ${value ? 'is-on' : ''}`}
    onClick=${() => onChange(!value)}
  >
    <span class="switch__knob"></span>
  </button>`;
}

export function ToggleField({ label, hint, value, onChange, wide }) {
  return html`<${Field} label=${label} hint=${hint} wide=${wide} className="field--toggle"><${Switch} value=${value} onChange=${onChange} /><//>`;
}

export function ColorField({ label, value, onChange }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return html`
    <${Field} label=${label}>
      <label class="color">
        <input type="color" value=${value} onInput=${(e) => onChange(e.currentTarget.value.toUpperCase())} />
        <span class="color__swatch" style=${{ background: value }}></span>
      </label>
      <input
        class="text color__hex"
        value=${text}
        spellcheck=${false}
        onInput=${(e) => {
          const raw = e.currentTarget.value;
          setText(raw);
          if (/^#?[0-9a-fA-F]{6}$/.test(raw.trim())) onChange(`#${raw.trim().replace('#', '').toUpperCase()}`);
        }}
        onBlur=${() => setText(value)}
      />
    <//>
  `;
}

export function TextInput({ value, onChange, placeholder, className = '', mono, onBlur }) {
  return html`<input
    class=${`text ${mono ? 'mono' : ''} ${className}`}
    value=${value}
    placeholder=${placeholder}
    spellcheck=${!mono}
    onInput=${(e) => onChange(e.currentTarget.value)}
    onBlur=${onBlur}
  />`;
}

/** Text input that only reports a value on commit (blur / Enter / datalist pick). */
export function CommitInput({ value, onCommit, placeholder, list, className = '' }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text.trim());
  };
  return html`<input
    class=${`text ${className}`}
    value=${text}
    list=${list}
    placeholder=${placeholder}
    spellcheck=${false}
    onInput=${(e) => setText(e.currentTarget.value)}
    onChange=${commit}
    onBlur=${commit}
    onKeyDown=${(e) => e.key === 'Enter' && commit()}
  />`;
}

export function FontField({ label, hint, value, onChange, fonts, placeholder }) {
  const listId = useMemo(() => uid('fonts'), []);
  return html`
    <${Field} label=${label} hint=${hint}>
      <${CommitInput} value=${value} onCommit=${onChange} list=${listId} placeholder=${placeholder} />
      <datalist id=${listId}>${fonts.map((f) => html`<option value=${f}></option>`)}</datalist>
    <//>
  `;
}

export function AutoTextarea({ value, onChange, placeholder, className = '', mono, rows = 1, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || SUPPORTS_FIELD_SIZING || el.offsetParent === null) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return html`<textarea
    ref=${ref}
    rows=${rows}
    class=${`textarea ${mono ? 'mono' : ''} ${className}`}
    value=${value}
    placeholder=${placeholder}
    spellcheck=${!mono}
    onInput=${(e) => onChange(e.currentTarget.value)}
    ...${rest}
  ></textarea>`;
}

export function Group({ id, title, badge, defaultOpen = true, actions, className = '', children }) {
  const [open, setOpen] = usePersistentState(`rb.group.${id}`, defaultOpen);
  return html`
    <section class=${`group ${open ? 'is-open' : ''} ${className}`}>
      <header class="group__header" onClick=${() => setOpen(!open)}>
        <${Icon} name=${open ? 'chevron-down' : 'chevron-right'} size=${14} className="group__chevron" />
        <span class="group__title">${title}</span>
        ${badge ? html`<span class="badge">${badge}</span>` : null}
        <span class="group__actions" onClick=${(e) => e.stopPropagation()}>${actions}</span>
      </header>
      ${open ? html`<div class="group__body">${children}</div>` : null}
    </section>
  `;
}

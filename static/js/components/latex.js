import { useEffect, useRef, useState } from 'preact/hooks';
import { fileUrl } from '../api.js';
import { html } from '../html.js';
import { Icon } from '../icons.js';
import { downloadBlob } from '../util.js';

const FILE_NOTES = {
  'resume.tex': 'LaTeX source of the last compile',
  'resume.pdf': 'Last successfully compiled PDF',
  'resume.log': 'Full TeX log of the last compile',
  'resume.json': 'Your resume data (auto-saved)',
};

export function LatexPanel({ active, generatedTex, manual, manualTex, onManualChange, onModeChange, result, outputDir, files }) {
  const hostRef = useRef(null);
  const cmRef = useRef(null);
  const marksRef = useRef([]);
  const onChangeRef = useRef(onManualChange);
  onChangeRef.current = onManualChange;
  const [showLog, setShowLog] = useState(false);
  const [copied, setCopied] = useState(false);
  const value = manual ? manualTex : generatedTex;

  useEffect(() => {
    if (!window.CodeMirror || !hostRef.current) return;
    const cm = window.CodeMirror(hostRef.current, {
      value: '',
      mode: 'stex',
      lineNumbers: true,
      lineWrapping: false,
      readOnly: true,
      tabSize: 2,
      indentUnit: 2,
      viewportMargin: 40,
    });
    cm.on('changes', (instance, changes) => {
      if (changes.some((c) => c.origin !== 'setValue')) onChangeRef.current(instance.getValue());
    });
    cmRef.current = cm;
  }, []);

  useEffect(() => {
    const cm = cmRef.current;
    if (!cm) return;
    if (cm.getValue() !== (value || '')) {
      const { left, top } = cm.getScrollInfo();
      cm.setValue(value || '');
      cm.scrollTo(left, top);
    }
    cm.setOption('readOnly', !manual);
    hostRef.current?.classList.toggle('is-readonly', !manual);
  }, [value, manual]);

  useEffect(() => {
    if (active) requestAnimationFrame(() => cmRef.current?.refresh());
  }, [active]);

  useEffect(() => {
    const cm = cmRef.current;
    if (!cm) return;
    marksRef.current.forEach((handle) => cm.removeLineClass(handle, 'background', 'cm-line-error'));
    marksRef.current = [];
    for (const error of result?.errors || []) {
      if (error.line && error.line <= cm.lineCount()) {
        marksRef.current.push(cm.addLineClass(error.line - 1, 'background', 'cm-line-error'));
      }
    }
  }, [result, value]);

  const jumpTo = (line) => {
    const cm = cmRef.current;
    if (!cm || !line) return;
    cm.focus();
    cm.setCursor({ line: line - 1, ch: 0 });
    cm.scrollIntoView({ line: line - 1, ch: 0 }, 140);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable (insecure context): user can still download */
    }
  };

  const errors = result?.errors || [];
  const warnings = result?.warnings || [];
  const overfull = warnings.filter((w) => w.kind === 'overfull');

  return html`
    <div class="latex-panel">
      <div class="latex-toolbar">
        <div class="segmented segmented--compact">
          <button type="button" class=${`segmented__btn ${!manual ? 'is-active' : ''}`} onClick=${() => onModeChange(false)} title="Code generated from the form (read-only)">
            <${Icon} name="sliders" size=${13} /> Generated
          </button>
          <button type="button" class=${`segmented__btn ${manual ? 'is-active' : ''}`} onClick=${() => onModeChange(true)} title="Edit the LaTeX by hand and compile it directly">
            <${Icon} name="edit" size=${13} /> Manual edit
          </button>
        </div>
        <span class="spacer"></span>
        <button type="button" class="btn btn--ghost btn--sm" onClick=${copy}><${Icon} name=${copied ? 'check' : 'copy'} size=${13} /> ${copied ? 'Copied' : 'Copy'}</button>
        <button type="button" class="btn btn--ghost btn--sm" onClick=${() => downloadBlob(value || '', 'resume.tex', 'text/x-tex')}>
          <${Icon} name="download" size=${13} /> .tex
        </button>
        ${manual
          ? html`<button
              type="button"
              class="btn btn--ghost btn--sm"
              title="Replace your manual edits with freshly generated code"
              onClick=${() => window.confirm('Discard manual edits and start again from the generated code?') && onManualChange(generatedTex)}
            >
              <${Icon} name="reset" size=${13} /> Reset
            </button>`
          : null}
      </div>
      ${manual
        ? html`<div class="notice notice--warn">
            <${Icon} name="edit" size=${14} />
            <span>Manual mode: the PDF is compiled from this code. Form changes don't apply until you switch back to <b>Generated</b> (your edits are kept).</span>
          </div>`
        : html`<div class="notice">
            <${Icon} name="code" size=${14} />
            <span>Read-only view of the code generated from the form. Every spacing knob is a named <code>\\rb…</code> length in the preamble.</span>
          </div>`}
      <div class="latex-editor" ref=${hostRef}></div>

      <div class="problems">
        <div class="problems__header">
          <span class=${`problems__count ${errors.length ? 'is-error' : ''}`}>
            ${errors.length ? `${errors.length} error${errors.length > 1 ? 's' : ''}` : 'No errors'}
          </span>
          <span class="problems__count">${warnings.length} warning${warnings.length === 1 ? '' : 's'}${overfull.length ? ` · ${overfull.length} overfull` : ''}</span>
          <span class="spacer"></span>
          <button type="button" class="btn btn--ghost btn--xs" onClick=${() => setShowLog(!showLog)} disabled=${!result?.log}>
            ${showLog ? 'Hide log' : 'Show full log'}
          </button>
        </div>
        ${errors.length || warnings.length
          ? html`<ul class="problems__list">
              ${errors.map(
                (e) => html`<li class="problem problem--error" onClick=${() => jumpTo(e.line)}>
                  <${Icon} name="alert" size=${13} />
                  <span class="problem__line">${e.line ? `L${e.line}` : '—'}</span>
                  <span class="problem__msg">${e.message}${e.context ? html`<code>${e.context}</code>` : null}</span>
                </li>`,
              )}
              ${warnings.slice(0, 40).map(
                (w) => html`<li class="problem" onClick=${() => jumpTo(w.line)}>
                  <span class="problem__line">${w.line ? `L${w.line}` : '—'}</span>
                  <span class="problem__msg">${w.message}</span>
                </li>`,
              )}
            </ul>`
          : null}
        ${showLog && result?.log ? html`<pre class="log">${result.log}</pre>` : null}
      </div>

      <div class="files">
        <div class="files__title"><${Icon} name="folder" size=${14} /> Backend files <code title=${outputDir}>${outputDir}</code></div>
        <div class="files__grid">
          ${files.map(
            (name) => html`<div class="file">
              <span class="file__name"><${Icon} name="file" size=${13} /> ${name}</span>
              <span class="file__note">${FILE_NOTES[name] || ''}</span>
              <a class="icon-btn" href=${fileUrl(name)} target="_blank" rel="noopener" title=${`Open ${name}`}><${Icon} name="external" size=${13} /></a>
              <a class="icon-btn" href=${fileUrl(name, true)} title=${`Download ${name}`}><${Icon} name="download" size=${13} /></a>
            </div>`,
          )}
        </div>
      </div>
    </div>
  `;
}

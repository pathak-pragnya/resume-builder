import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { api, fileUrl } from './api.js';
import { ContentPanel } from './components/content.js';
import { DesignPanel } from './components/design.js';
import { IconButton, Switch } from './components/fields.js';
import { LatexPanel } from './components/latex.js';
import { PdfPreview } from './components/preview.js';
import { html } from './html.js';
import { Icon } from './icons.js';
import { hydrateResume } from './model.js';
import { useDocumentHistory } from './store.js';
import { base64ToBytes, clamp, downloadBlob, isTextTarget, setIn, usePersistentState } from './util.js';

const COMPILE_DEBOUNCE_MS = 450;
const SAVE_DEBOUNCE_MS = 800;

export function App() {
  const [boot, setBoot] = useState({ config: null, initial: null, error: null });

  useEffect(() => {
    Promise.all([api.config(), api.loadResume()])
      .then(([config, saved]) => setBoot({ config, initial: hydrateResume(saved.resume, config.defaults), error: null }))
      .catch((err) => setBoot({ config: null, initial: null, error: err.message }));
  }, []);

  if (boot.error) {
    return html`<div class="boot boot--error">
      <strong>Could not reach the resume server.</strong>
      <span>${boot.error}</span>
      <span>Start it with <code>python3 server.py</code> and reload.</span>
    </div>`;
  }
  if (!boot.config) return html`<div class="boot">Loading…</div>`;
  return html`<${Workspace} config=${boot.config} initial=${boot.initial} />`;
}

function Workspace({ config, initial }) {
  const history = useDocumentHistory(initial);
  const { doc, update } = history;

  const [tab, setTab] = usePersistentState('rb.tab', 'content');
  const [autoCompile, setAutoCompile] = usePersistentState('rb.autoCompile', true);
  const [manual, setManual] = usePersistentState('rb.manual', false);
  const [manualTex, setManualTex] = usePersistentState('rb.manualTex', '');
  const [editorWidth, setEditorWidth] = usePersistentState('rb.editorWidth', 520);
  const [generatedTex, setGeneratedTex] = useState('');
  const [result, setResult] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [status, setStatus] = useState('idle');

  const latest = useRef({});
  latest.current = { doc, manual, manualTex };
  const compileState = useRef({ running: false, queued: false });

  const compile = useCallback(async () => {
    const state = compileState.current;
    if (state.running) {
      state.queued = true;
      return;
    }
    state.running = true;
    setStatus('compiling');
    try {
      do {
        state.queued = false;
        const { doc: current, manual: isManual, manualTex: tex } = latest.current;
        const useManual = isManual && tex.trim();
        let response;
        try {
          response = await api.compile(useManual ? { tex } : { resume: current });
        } catch (err) {
          response = { ok: false, errors: [{ line: null, message: err.message }], warnings: [] };
        }
        if (!useManual && response.tex) setGeneratedTex(response.tex);
        if (response.ok && response.pdf) setPdf(base64ToBytes(response.pdf));
        setResult(response);
        setStatus(response.ok ? 'ok' : 'error');
      } while (state.queued);
    } finally {
      state.running = false;
    }
  }, []);

  useEffect(() => {
    if (!autoCompile) return undefined;
    const timer = setTimeout(compile, COMPILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [doc, manual, manual ? manualTex : null, autoCompile]);

  useEffect(() => {
    if (autoCompile) return undefined;
    const timer = setTimeout(() => {
      api.generate(doc).then((r) => setGeneratedTex(r.tex)).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [doc, autoCompile]);

  useEffect(() => {
    const timer = setTimeout(() => api.saveResume(doc).catch(() => {}), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [doc]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's' || key === 'enter') {
        e.preventDefault();
        compile();
      } else if (key === 'z' && !isTextTarget(e.target)) {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (key === 'y' && !isTextTarget(e.target)) {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compile, history.undo, history.redo]);

  const setLayout = useCallback((path, value) => update((d) => setIn(d.layout, path.split('.'), value), `layout.${path}`), [update]);
  const applyLayout = useCallback((mutate) => update((d) => mutate(d.layout)), [update]);

  const changeMode = (toManual) => {
    if (toManual && !manualTex.trim()) setManualTex(generatedTex);
    setManual(toManual);
  };

  const exportJson = () => downloadBlob(JSON.stringify(doc, null, 2), 'resume.json', 'application/json');
  const importJson = () => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        history.replace(hydrateResume(JSON.parse(await file.text()), config.defaults));
      } catch (err) {
        window.alert(`Could not import ${file.name}: ${err.message}`);
      }
    };
    input.click();
  };
  const resetSample = () => {
    if (window.confirm('Replace everything with the sample resume? You can undo this.')) {
      history.replace(hydrateResume(config.defaults.resume, config.defaults));
    }
  };
  const resetDesign = () => {
    if (window.confirm('Reset all Design settings to defaults? Content is kept. You can undo this.')) {
      update((d) => (d.layout = structuredClone(config.defaults.layout)));
    }
  };

  const startResize = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const start = editorWidth;
    const onMove = (e) => setEditorWidth(clamp(start + e.clientX - startX, 380, Math.max(420, window.innerWidth - 360)));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('is-resizing');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.classList.add('is-resizing');
  };

  const tabs = [
    { id: 'content', label: 'Content', icon: 'file' },
    { id: 'design', label: 'Design', icon: 'sliders' },
    { id: 'latex', label: 'LaTeX', icon: 'code', badge: result && !result.ok ? '!' : null },
  ];

  return html`
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <span class="brand__mark">TeX</span>
          <span class="brand__name">Resume Builder</span>
        </div>
        <div class="topbar__group">
          <${IconButton} icon="undo" title="Undo (⌘Z)" disabled=${!history.canUndo} onClick=${history.undo} />
          <${IconButton} icon="redo" title="Redo (⇧⌘Z)" disabled=${!history.canRedo} onClick=${history.redo} />
        </div>
        <div class="topbar__group">
          <button type="button" class="btn btn--primary" onClick=${compile} title="Compile now (⌘S / ⌘↵)">
            <${Icon} name="play" size=${13} /> Compile
          </button>
          <label class="auto-toggle" title="Recompile automatically after each change">
            <${Switch} value=${autoCompile} onChange=${setAutoCompile} /> Auto
          </label>
          <${StatusPill} status=${status} result=${result} manual=${manual} onShowErrors=${() => setTab('latex')} />
        </div>
        <span class="spacer"></span>
        <div class="topbar__group">
          <a class="btn btn--ghost" href=${fileUrl('resume.pdf', true)} title="Download the compiled PDF"><${Icon} name="download" size=${14} /> PDF</a>
          <a class="btn btn--ghost" href=${fileUrl('resume.tex', true)} title="Download the LaTeX source"><${Icon} name="download" size=${14} /> .tex</a>
          <${Menu}
            items=${[
              { label: 'Export resume JSON', icon: 'download', onClick: exportJson },
              { label: 'Import resume JSON…', icon: 'upload', onClick: importJson },
              { separator: true },
              { label: 'Reset design to defaults', icon: 'sliders', onClick: resetDesign },
              { label: 'Load sample resume', icon: 'reset', onClick: resetSample },
            ]}
          />
        </div>
      </header>

      <main class="workspace" style=${{ '--editor-width': `${editorWidth}px` }}>
        <section class="editor">
          <nav class="tabs" role="tablist">
            ${tabs.map(
              (t) => html`<button type="button" role="tab" aria-selected=${tab === t.id} class=${`tab ${tab === t.id ? 'is-active' : ''}`} onClick=${() => setTab(t.id)}>
                <${Icon} name=${t.icon} size=${14} /> ${t.label}${t.badge ? html`<span class="tab__badge">${t.badge}</span>` : null}
              </button>`,
            )}
          </nav>
          <div class="tab-panels">
            ${tab === 'content' ? html`<${ContentPanel} doc=${doc} update=${update} />` : null}
            ${tab === 'design'
              ? html`<${DesignPanel} layout=${doc.layout} setLayout=${setLayout} applyLayout=${applyLayout} config=${config} />`
              : null}
            <div class=${`tab-panel ${tab === 'latex' ? '' : 'is-hidden'}`}>
              <${LatexPanel}
                active=${tab === 'latex'}
                generatedTex=${generatedTex}
                manual=${manual}
                manualTex=${manualTex}
                onManualChange=${setManualTex}
                onModeChange=${changeMode}
                result=${result}
                outputDir=${config.outputDir}
                files=${config.files}
              />
            </div>
          </div>
        </section>
        <div class="splitter" onPointerDown=${startResize} title="Drag to resize"></div>
        <${PdfPreview} pdf=${pdf} result=${result} status=${status} page=${doc.layout.page} manual=${manual} />
      </main>
    </div>
  `;
}

function StatusPill({ status, result, manual, onShowErrors }) {
  let body;
  if (status === 'compiling') body = html`<span class="spinner"></span> Compiling…`;
  else if (status === 'error')
    body = html`<button type="button" class="status__link" onClick=${onShowErrors}><${Icon} name="alert" size=${13} /> LaTeX error — details</button>`;
  else if (status === 'ok')
    body = html`<${Icon} name="check" size=${13} /> ${result?.engine === 'pdflatex' ? 'pdfLaTeX' : 'XeLaTeX'} · ${(result.durationMs / 1000).toFixed(2)}s`;
  else body = 'Ready';
  return html`<span class=${`status status--${status}`}>
    ${body}${manual ? html`<span class="status__tag">manual .tex</span>` : null}
  </span>`;
}

function Menu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return html`
    <div class="menu" ref=${ref}>
      <${IconButton} icon="more" title="More actions" active=${open} onClick=${() => setOpen(!open)} />
      ${open
        ? html`<div class="menu__popover" role="menu">
            ${items.map((item) =>
              item.separator
                ? html`<div class="menu__sep"></div>`
                : html`<button
                    type="button"
                    role="menuitem"
                    class="menu__item"
                    onClick=${() => {
                      setOpen(false);
                      item.onClick();
                    }}
                  >
                    <${Icon} name=${item.icon} size=${14} /> ${item.label}
                  </button>`,
            )}
          </div>`
        : null}
    </div>
  `;
}

import { useEffect, useRef, useState } from 'preact/hooks';
import * as pdfjsLib from '../../vendor/pdf.min.mjs';
import { fileUrl } from '../api.js';
import { html } from '../html.js';
import { Icon } from '../icons.js';
import { IconButton } from './fields.js';
import { formatPt, lengthToBp, usePersistentState } from '../util.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/vendor/pdf.worker.min.mjs';

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const CSS_PX_PER_PT = 96 / 72;
const PAGE_PADDING = 48;

function guidesFor(page, scale) {
  const el = document.createElement('div');
  el.className = 'pdf-guides';
  const [top, right, bottom, left] = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].map((k) => lengthToBp(page[k]) * scale);
  Object.assign(el.style, { top: `${top}px`, right: `${right}px`, bottom: `${bottom}px`, left: `${left}px` });
  return el;
}

export function PdfPreview({ pdf, result, status, page, manual }) {
  const scrollRef = useRef(null);
  const pagesRef = useRef(null);
  const renderToken = useRef(0);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = usePersistentState('rb.zoom', 'fit');
  const [guides, setGuides] = usePersistentState('rb.guides', false);
  const [renderError, setRenderError] = useState(null);
  const pageKey = JSON.stringify(page);

  useEffect(() => {
    const el = scrollRef.current;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !width) return;
    const token = ++renderToken.current;
    let doc = null;
    (async () => {
      try {
        doc = await pdfjsLib.getDocument({ data: pdf.slice(0) }).promise;
        const dpr = window.devicePixelRatio || 1;
        const nodes = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const pdfPage = await doc.getPage(n);
          const base = pdfPage.getViewport({ scale: 1 });
          const cssScale = zoom === 'fit' ? Math.max(0.2, (width - PAGE_PADDING) / base.width) : zoom * CSS_PX_PER_PT;
          const viewport = pdfPage.getViewport({ scale: cssScale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          if (token !== renderToken.current) return;
          const wrap = document.createElement('div');
          wrap.className = 'pdf-page';
          wrap.style.width = `${Math.floor(base.width * cssScale)}px`;
          wrap.style.height = `${Math.floor(base.height * cssScale)}px`;
          wrap.dataset.page = String(n);
          wrap.appendChild(canvas);
          if (guides && page) wrap.appendChild(guidesFor(page, cssScale));
          nodes.push(wrap);
        }
        if (token !== renderToken.current) return;
        const scroller = scrollRef.current;
        const { scrollTop, scrollLeft } = scroller;
        pagesRef.current.replaceChildren(...nodes);
        scroller.scrollTop = scrollTop;
        scroller.scrollLeft = scrollLeft;
        setRenderError(null);
      } catch (err) {
        if (token === renderToken.current) setRenderError(err.message || String(err));
      } finally {
        doc?.destroy();
      }
    })();
  }, [pdf, width, zoom, guides, pageKey]);

  const zoomIndex = zoom === 'fit' ? -1 : ZOOMS.indexOf(zoom);
  const stepZoom = (delta) => {
    if (zoom === 'fit') {
      const pageWidth = pagesRef.current?.firstElementChild?.offsetWidth || 600;
      const current = pageWidth / (8.5 * 72 * CSS_PX_PER_PT);
      const next = delta > 0 ? ZOOMS.find((z) => z > current + 0.01) : [...ZOOMS].reverse().find((z) => z < current - 0.01);
      setZoom(next ?? (delta > 0 ? ZOOMS[ZOOMS.length - 1] : ZOOMS[0]));
    } else {
      setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, zoomIndex + delta))]);
    }
  };

  const stats = result?.stats;
  const failed = result && !result.ok;

  return html`
    <section class="preview">
      <div class="preview__toolbar">
        <${FitBadge} stats=${stats} />
        <span class="spacer"></span>
        <${IconButton} icon="zoom-out" title="Zoom out" onClick=${() => stepZoom(-1)} />
        <select class="select select--compact" value=${String(zoom)} onChange=${(e) => setZoom(e.currentTarget.value === 'fit' ? 'fit' : Number(e.currentTarget.value))}>
          <option value="fit">Fit width</option>
          ${ZOOMS.map((z) => html`<option value=${String(z)}>${Math.round(z * 100)}%</option>`)}
        </select>
        <${IconButton} icon="zoom-in" title="Zoom in" onClick=${() => stepZoom(1)} />
        <span class="toolbar-sep"></span>
        <${IconButton}
          icon="guides"
          title=${manual ? 'Margin guides (from Design tab values)' : 'Show margin guides'}
          active=${guides}
          onClick=${() => setGuides(!guides)}
        />
        <a class="icon-btn" href=${fileUrl('resume.pdf')} target="_blank" rel="noopener" title="Open PDF in a new tab"><${Icon} name="external" size=${15} /></a>
      </div>
      ${status === 'compiling' ? html`<div class="progress"><span></span></div>` : null}
      ${failed
        ? html`<div class="preview__error">
            <${Icon} name="alert" size=${15} />
            <div>
              <strong>LaTeX error${result.errors?.[0]?.line ? ` on line ${result.errors[0].line}` : ''}:</strong>
              ${' '}${result.errors?.[0]?.message || 'Compilation failed.'}
              <div class="preview__error-sub">${pdf ? 'Showing the last successful PDF. ' : ''}Open the LaTeX tab for details.</div>
            </div>
          </div>`
        : null}
      ${renderError ? html`<div class="preview__error"><${Icon} name="alert" size=${15} /> Could not render PDF: ${renderError}</div>` : null}
      <div class=${`preview__scroll ${failed && pdf ? 'is-stale' : ''}`} ref=${scrollRef}>
        <div class="pdf-pages" ref=${pagesRef}></div>
        ${!pdf && !failed ? html`<div class="preview__empty">${status === 'compiling' ? 'Compiling your resume…' : 'Your PDF will appear here.'}</div>` : null}
      </div>
    </section>
  `;
}

function FitBadge({ stats }) {
  if (!stats) return html`<span class="fit-badge">—</span>`;
  const { pages, remainingPt } = stats;
  const pagesLabel = `${pages} page${pages === 1 ? '' : 's'}`;
  if (remainingPt == null) return html`<span class="fit-badge">${pagesLabel}</span>`;
  const tone = pages === 1 ? (remainingPt < 6 ? 'warn' : 'ok') : 'info';
  const title =
    pages === 1
      ? 'Vertical space left at the bottom of the page before content would spill onto page 2.'
      : `Free space at the bottom of page ${pages}.`;
  return html`<span class=${`fit-badge fit-badge--${tone}`} title=${title}>
    ${pagesLabel} · ${formatPt(Math.max(0, remainingPt))} free${pages > 1 ? ` on p.${pages}` : ''}
  </span>`;
}

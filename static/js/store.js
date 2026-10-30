import { useCallback, useRef, useState } from 'preact/hooks';
import { clone } from './util.js';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 800;

/**
 * Undoable document state. `update(mutator, key)` clones the document, lets the
 * mutator edit the copy, and records one history step. Consecutive updates with
 * the same `key` (e.g. typing in one field) collapse into a single step.
 */
export function useDocumentHistory(initial) {
  const [history, setHistory] = useState({ past: [], present: initial, future: [] });
  const last = useRef({ key: null, time: 0 });

  const update = useCallback((mutate, key = null) => {
    setHistory((h) => {
      const next = clone(h.present);
      mutate(next);
      const now = Date.now();
      const merge = key !== null && key === last.current.key && now - last.current.time < COALESCE_MS;
      last.current = { key, time: now };
      return {
        past: merge ? h.past : [...h.past.slice(-HISTORY_LIMIT), h.present],
        present: next,
        future: [],
      };
    });
  }, []);

  const replace = useCallback((value) => {
    last.current = { key: null, time: 0 };
    setHistory((h) => ({ past: h.present ? [...h.past.slice(-HISTORY_LIMIT), h.present] : [], present: value, future: [] }));
  }, []);

  const undo = useCallback(() => {
    last.current = { key: null, time: 0 };
    setHistory((h) =>
      h.past.length
        ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
        : h,
    );
  }, []);

  const redo = useCallback(() => {
    last.current = { key: null, time: 0 };
    setHistory((h) =>
      h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h,
    );
  }, []);

  return {
    doc: history.present,
    update,
    replace,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

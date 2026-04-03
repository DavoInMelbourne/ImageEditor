/**
 * Central application state & undo/redo history.
 */

export interface AppState {
  svgContent: string | null;
  selectedElements: SVGElement[];
  zoom: number;
  history: string[];
  historyIndex: number;
  originalFilename: string | null;
  pngFile: File | null;
}

const MAX_HISTORY = 50;

export const state: AppState = {
  svgContent: null,
  selectedElements: [],
  zoom: 100,
  history: [],
  historyIndex: -1,
  originalFilename: null,
  pngFile: null,
};

export function pushState(svgString: string): void {
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(svgString);
  if (state.history.length > MAX_HISTORY) state.history.shift();
  state.historyIndex = state.history.length - 1;
  state.svgContent = svgString;
  updateUndoRedoButtons();
}

export function undo(): string | null {
  if (state.historyIndex <= 0) return null;
  state.historyIndex--;
  state.svgContent = state.history[state.historyIndex];
  updateUndoRedoButtons();
  return state.svgContent;
}

export function redo(): string | null {
  if (state.historyIndex >= state.history.length - 1) return null;
  state.historyIndex++;
  state.svgContent = state.history[state.historyIndex];
  updateUndoRedoButtons();
  return state.svgContent;
}

function updateUndoRedoButtons(): void {
  const undoBtn = document.getElementById('btn-undo') as HTMLButtonElement | null;
  const redoBtn = document.getElementById('btn-redo') as HTMLButtonElement | null;
  if (undoBtn) undoBtn.disabled = state.historyIndex <= 0;
  if (redoBtn) redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

export function setStatus(text: string): void {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
}

export function enableEditingButtons(): void {
  const ids = [
    'btn-export-svg', 'btn-export-png', 'btn-smooth',
    'btn-recolor', 'btn-replace-text', 'btn-reconvert',
    'btn-export-custom',
  ];
  ids.forEach(id => {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = false;
  });
}

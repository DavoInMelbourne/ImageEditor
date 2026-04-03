/**
 * Canvas rendering, zoom, and SVG display management.
 */
import { state, pushState, setStatus, enableEditingButtons } from './state.js';
import { buildComponentList } from './components.js';
import { log } from './logger.js';

function canvasContainer(): HTMLElement {
  return document.getElementById('canvas-container')!;
}

function svgCanvas(): HTMLElement {
  return document.getElementById('svg-canvas')!;
}

function dropZone(): HTMLElement | null {
  return document.getElementById('drop-zone');
}

export function renderSVG(svgString: string, addToHistory = true): void {
  const canvas = svgCanvas();
  const drop = dropZone();

  canvas.innerHTML = svgString;
  canvas.style.display = 'flex';
  if (drop) drop.style.display = 'none';

  if (addToHistory) pushState(svgString);

  const svg = canvas.querySelector('svg');
  if (svg) {
    applyZoom();
    makeElementsSelectable(svg);
    buildComponentList();
    enableEditingButtons();
    const pathCount = countPaths(svg);
    const hasImage = !!svg.querySelector('image');
    log.info(`SVG rendered: ${pathCount} paths, embedded image: ${hasImage}, history: ${state.history.length}`);
    setStatus(`SVG loaded — ${pathCount} paths${hasImage ? ' (HQ)' : ''}`);
  }
}

export function getCurrentSVG(): string | null {
  const canvas = svgCanvas();
  const svg = canvas.querySelector('svg');
  if (!svg) return null;
  // Clean up selection classes before export
  svg.querySelectorAll('.selected, .hoverable').forEach(el => {
    el.classList.remove('selected', 'hoverable');
  });
  const result = svg.outerHTML;
  // Re-add hoverable
  makeElementsSelectable(svg);
  return result;
}

export function applyZoom(): void {
  const svg = svgCanvas().querySelector('svg') as SVGSVGElement | null;
  if (!svg) return;
  svg.style.transform = `scale(${state.zoom / 100})`;
  svg.style.transformOrigin = 'center center';
  const display = document.getElementById('zoom-display');
  if (display) display.textContent = `${state.zoom}%`;
}

function countPaths(svg: Element): number {
  return svg.querySelectorAll('path, circle, rect, ellipse, polygon, polyline, line').length;
}

function makeElementsSelectable(svg: Element): void {
  const elements = svg.querySelectorAll(
    'path, circle, rect, ellipse, polygon, polyline, line, text, g > path, g > circle, g > rect'
  );
  elements.forEach(el => {
    el.classList.add('hoverable');
    el.removeEventListener('click', handleElementClick);
    el.addEventListener('click', handleElementClick);
  });
}

function handleElementClick(e: Event): void {
  e.stopPropagation();
  const el = e.target as SVGElement;
  const mouseEvent = e as MouseEvent;

  if (mouseEvent.shiftKey) {
    if (state.selectedElements.includes(el)) {
      state.selectedElements = state.selectedElements.filter(s => s !== el);
      el.classList.remove('selected');
    } else {
      state.selectedElements.push(el);
      el.classList.add('selected');
    }
  } else {
    clearSelection();
    state.selectedElements = [el];
    el.classList.add('selected');
  }
  updateSelectionButtons();
  buildComponentList();
}

export function clearSelection(): void {
  state.selectedElements.forEach(el => el.classList.remove('selected'));
  state.selectedElements = [];
  updateSelectionButtons();
}

function updateSelectionButtons(): void {
  const hasSelection = state.selectedElements.length > 0;
  const groupBtn = document.getElementById('btn-group') as HTMLButtonElement | null;
  const ungroupBtn = document.getElementById('btn-ungroup') as HTMLButtonElement | null;
  const deleteBtn = document.getElementById('btn-delete-selected') as HTMLButtonElement | null;
  const extractBtn = document.getElementById('btn-extract') as HTMLButtonElement | null;

  if (groupBtn) groupBtn.disabled = state.selectedElements.length < 2;
  if (ungroupBtn) ungroupBtn.disabled = !hasSelection;
  if (deleteBtn) deleteBtn.disabled = !hasSelection;
  if (extractBtn) extractBtn.disabled = !hasSelection;
}

export function showLoading(): void {
  const container = canvasContainer();
  if (container.querySelector('.loading-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.innerHTML = '<div class="spinner"></div>';
  container.appendChild(overlay);
}

export function hideLoading(): void {
  const overlay = canvasContainer().querySelector('.loading-overlay');
  if (overlay) overlay.remove();
}

export function initZoom(): void {
  const slider = document.getElementById('zoom-slider') as HTMLInputElement;

  slider.addEventListener('input', () => {
    state.zoom = parseInt(slider.value);
    applyZoom();
  });

  canvasContainer().addEventListener('wheel', (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -10 : 10;
      state.zoom = Math.max(10, Math.min(300, state.zoom + delta));
      slider.value = String(state.zoom);
      applyZoom();
    }
  }, { passive: false });
}

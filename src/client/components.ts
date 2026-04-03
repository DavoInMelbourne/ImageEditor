/**
 * SVG component management — split, group, ungroup, delete, extract.
 */
import { state, setStatus, pushState } from './state.js';
import { renderSVG, getCurrentSVG, clearSelection } from './canvas.js';

export function initComponents(): void {
  document.getElementById('btn-group')!.addEventListener('click', groupSelected);
  document.getElementById('btn-ungroup')!.addEventListener('click', ungroupSelected);
  document.getElementById('btn-delete-selected')!.addEventListener('click', deleteSelected);
  document.getElementById('btn-extract')!.addEventListener('click', extractSelected);
}

export function buildComponentList(): void {
  const listEl = document.getElementById('component-list')!;
  const svgCanvas = document.getElementById('svg-canvas')!;
  const svg = svgCanvas.querySelector('svg');
  if (!svg) { listEl.innerHTML = ''; return; }

  // Get top-level children of the SVG
  const children = Array.from(svg.children).filter(
    el => el.tagName !== 'defs' && el.tagName !== 'style'
  );

  listEl.innerHTML = '';
  children.forEach((child, index) => {
    const item = document.createElement('div');
    item.className = 'component-item';
    if (state.selectedElements.includes(child as SVGElement)) {
      item.classList.add('selected');
    }

    const color = getElementColor(child as SVGElement);
    const name = getElementName(child as SVGElement, index);

    item.innerHTML = `
      <span class="swatch" style="background:${color}"></span>
      <span class="name" title="${name}">${name}</span>
      <button class="vis-toggle" data-index="${index}" title="Toggle visibility">
        ${(child as HTMLElement).style.display === 'none' ? '👁️‍🗨️' : '👁️'}
      </button>
    `;

    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('vis-toggle')) return;
      const svgEl = child as SVGElement;
      if ((e as MouseEvent).shiftKey) {
        if (state.selectedElements.includes(svgEl)) {
          state.selectedElements = state.selectedElements.filter(s => s !== svgEl);
          svgEl.classList.remove('selected');
        } else {
          state.selectedElements.push(svgEl);
          svgEl.classList.add('selected');
        }
      } else {
        clearSelection();
        state.selectedElements = [svgEl];
        svgEl.classList.add('selected');
      }
      buildComponentList();
    });

    const visBtn = item.querySelector('.vis-toggle')!;
    visBtn.addEventListener('click', () => {
      const el = child as HTMLElement;
      el.style.display = el.style.display === 'none' ? '' : 'none';
      buildComponentList();
    });

    listEl.appendChild(item);
  });
}

function getElementColor(el: SVGElement): string {
  const fill = el.getAttribute('fill') || el.style.fill;
  if (fill && fill !== 'none') return fill;

  // Check children
  const child = el.querySelector('[fill]');
  if (child) return child.getAttribute('fill') || '#666';

  return '#666';
}

function getElementName(el: SVGElement, index: number): string {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute('id');
  if (id) return `${tag}#${id}`;

  if (tag === 'g') {
    const childCount = el.children.length;
    return `group (${childCount} items)`;
  }

  if (tag === 'text') {
    return `text: "${el.textContent?.slice(0, 20) || ''}"`;
  }

  return `${tag} [${index}]`;
}

function groupSelected(): void {
  if (state.selectedElements.length < 2) return;

  const svgCanvas = document.getElementById('svg-canvas')!;
  const svg = svgCanvas.querySelector('svg');
  if (!svg) return;

  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  // Insert group before the first selected element
  const first = state.selectedElements[0];
  first.parentNode!.insertBefore(group, first);

  // Move all selected into the group
  state.selectedElements.forEach(el => {
    el.classList.remove('selected', 'hoverable');
    group.appendChild(el);
  });

  clearSelection();
  const newSvg = svg.outerHTML;
  renderSVG(newSvg);
  setStatus(`Grouped ${state.selectedElements.length} elements`);
}

function ungroupSelected(): void {
  const svgCanvas = document.getElementById('svg-canvas')!;
  const svg = svgCanvas.querySelector('svg');
  if (!svg) return;

  let ungrouped = 0;
  state.selectedElements.forEach(el => {
    if (el.tagName.toLowerCase() === 'g') {
      const parent = el.parentNode!;
      const children = Array.from(el.children);
      children.forEach(child => {
        parent.insertBefore(child, el);
      });
      parent.removeChild(el);
      ungrouped++;
    }
  });

  clearSelection();
  if (ungrouped > 0) {
    renderSVG(svg.outerHTML);
    setStatus(`Ungrouped ${ungrouped} group(s)`);
  }
}

function deleteSelected(): void {
  const svgCanvas = document.getElementById('svg-canvas')!;
  const svg = svgCanvas.querySelector('svg');
  if (!svg) return;

  const count = state.selectedElements.length;
  state.selectedElements.forEach(el => {
    el.parentNode?.removeChild(el);
  });

  clearSelection();
  renderSVG(svg.outerHTML);
  setStatus(`Deleted ${count} element(s)`);
}

function extractSelected(): void {
  if (state.selectedElements.length === 0) return;

  const svgCanvas = document.getElementById('svg-canvas')!;
  const svg = svgCanvas.querySelector('svg');
  if (!svg) return;

  // Create a new SVG with just the selected elements
  const viewBox = svg.getAttribute('viewBox') || `0 0 ${svg.getAttribute('width') || 800} ${svg.getAttribute('height') || 600}`;

  // Clone defs if present
  const defs = svg.querySelector('defs');
  const defsClone = defs ? defs.outerHTML : '';

  const elements = state.selectedElements.map(el => {
    el.classList.remove('selected', 'hoverable');
    return el.outerHTML;
  }).join('\n');

  const extractedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n${defsClone}\n${elements}\n</svg>`;

  // Download the extracted SVG
  const blob = new Blob([extractedSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `extracted_${Date.now()}.svg`;
  a.click();
  URL.revokeObjectURL(url);

  setStatus(`Extracted ${state.selectedElements.length} element(s)`);
}

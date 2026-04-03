/**
 * Text replacement in SVGs.
 *
 * Two strategies:
 * 1. If the SVG contains <text> elements, replace their content directly.
 * 2. If the text is rendered as paths (common from traced PNGs), we remove
 *    the selected path region and overlay a new <text> element with matching
 *    style, position, and gradient fill.
 */
import { state, setStatus } from './state.js';
import { renderSVG, getCurrentSVG } from './canvas.js';

export function initTextReplace(): void {
  const replaceBtn = document.getElementById('btn-replace-text') as HTMLButtonElement;

  replaceBtn.addEventListener('click', () => {
    const findInput = document.getElementById('text-find') as HTMLInputElement;
    const replaceInput = document.getElementById('text-replace') as HTMLInputElement;
    const fontSelect = document.getElementById('text-font') as HTMLSelectElement;

    const findText = findInput.value.trim();
    const replaceText = replaceInput.value.trim();
    const font = fontSelect.value;

    if (!findText || !replaceText) {
      setStatus('Please enter both find and replace text');
      return;
    }

    replaceTextInSVG(findText, replaceText, font);
  });
}

function replaceTextInSVG(find: string, replace: string, font: string): void {
  const svgString = getCurrentSVG();
  if (!svgString) return;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return;

  // Strategy 1: Replace in <text> elements
  const textElements = doc.querySelectorAll('text');
  let replaced = 0;

  textElements.forEach(textEl => {
    if (textEl.textContent?.includes(find)) {
      textEl.textContent = textEl.textContent.replace(find, replace);
      textEl.setAttribute('font-family', font);
      replaced++;
    }
  });

  if (replaced > 0) {
    renderSVG(svg.outerHTML);
    setStatus(`Replaced "${find}" with "${replace}" in ${replaced} text element(s)`);
    return;
  }

  // Strategy 2: For path-based text, use selected elements or add overlay
  if (state.selectedElements.length > 0) {
    replaceSelectedWithText(doc, svg, find, replace, font);
  } else {
    addTextOverlay(doc, svg, replace, font);
  }
}

function replaceSelectedWithText(
  doc: Document,
  svg: SVGSVGElement,
  _find: string,
  replace: string,
  font: string
): void {
  // Get bounding box of selected elements
  const bbox = getSelectedBBox();
  if (!bbox) return;

  // Detect the dominant color from selected elements
  const color = getDominantColor();

  // Remove selected elements
  state.selectedElements.forEach(el => el.parentNode?.removeChild(el));

  // Create text element positioned where the deleted paths were
  const textEl = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
  textEl.setAttribute('x', String(bbox.x + bbox.width / 2));
  textEl.setAttribute('y', String(bbox.y + bbox.height * 0.8)); // baseline offset
  textEl.setAttribute('font-family', font);
  textEl.setAttribute('font-size', String(bbox.height * 0.9));
  textEl.setAttribute('font-weight', 'bold');
  textEl.setAttribute('fill', color);
  textEl.setAttribute('text-anchor', 'middle');
  textEl.textContent = replace;

  svg.appendChild(textEl);
  state.selectedElements = [];

  renderSVG(svg.outerHTML);
  setStatus(`Replaced selected paths with text "${replace}"`);
}

function addTextOverlay(doc: Document, svg: SVGSVGElement, replace: string, font: string): void {
  // Get SVG dimensions for positioning
  const viewBox = svg.getAttribute('viewBox');
  let width = 800, height = 400;
  if (viewBox) {
    const parts = viewBox.split(/\s+/);
    width = parseFloat(parts[2]) || width;
    height = parseFloat(parts[3]) || height;
  }

  // Detect dominant color
  const fills = Array.from(svg.querySelectorAll('[fill]'))
    .map(el => el.getAttribute('fill'))
    .filter(f => f && f !== 'none' && !f.startsWith('url('));

  const color = fills[0] || '#333';

  const textEl = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
  textEl.setAttribute('x', String(width / 2));
  textEl.setAttribute('y', String(height / 2));
  textEl.setAttribute('font-family', font);
  textEl.setAttribute('font-size', String(height * 0.3));
  textEl.setAttribute('font-weight', 'bold');
  textEl.setAttribute('fill', color);
  textEl.setAttribute('text-anchor', 'middle');
  textEl.setAttribute('dominant-baseline', 'central');
  textEl.textContent = replace;

  svg.appendChild(textEl);

  renderSVG(svg.outerHTML);
  setStatus(`Added text overlay "${replace}" — select paths first for precise replacement`);
}

function getSelectedBBox(): { x: number; y: number; width: number; height: number } | null {
  if (state.selectedElements.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  state.selectedElements.forEach(el => {
    if (typeof (el as any).getBBox === 'function') {
      try {
        const bbox = (el as any).getBBox();
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
      } catch (_) {
        // getBBox can fail if element is not rendered
      }
    }
  });

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getDominantColor(): string {
  for (const el of state.selectedElements) {
    const fill = el.getAttribute('fill');
    if (fill && fill !== 'none' && !fill.startsWith('url(')) return fill;

    const style = el.getAttribute('style');
    if (style) {
      const match = style.match(/fill\s*:\s*([^;]+)/);
      if (match && match[1].trim() !== 'none') return match[1].trim();
    }
  }
  return '#333333';
}

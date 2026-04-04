/**
 * Eraser tool — draw rectangles to erase parts of the image.
 */
import { state, setStatus, pushState } from './state.js';
import { renderSVG, clearSelection } from './canvas.js';

let isErasing = false;
let startX = 0;
let startY = 0;
let eraserRect: SVGRectElement | null = null;

export function initEraser(): void {
  const eraserBtn = document.getElementById('btn-eraser');
  if (!eraserBtn) return;

  eraserBtn.addEventListener('click', () => {
    eraserBtn.classList.toggle('active');
    if (eraserBtn.classList.contains('active')) {
      setStatus('Click and drag on image to erase');
      document.body.style.cursor = 'crosshair';
    } else {
      setStatus('Ready');
      document.body.style.cursor = '';
    }
  });

  const canvas = document.getElementById('svg-canvas');
  if (!canvas) return;

  canvas.addEventListener('mousedown', handleEraserStart);
  canvas.addEventListener('mousemove', handleEraserMove);
  canvas.addEventListener('mouseup', handleEraserEnd);
  canvas.addEventListener('mouseleave', handleEraserEnd);
}

function handleEraserStart(e: MouseEvent): void {
  const eraserBtn = document.getElementById('btn-eraser');
  if (!eraserBtn?.classList.contains('active')) return;

  isErasing = true;
  const canvas = document.getElementById('svg-canvas')!;
  const svg = canvas.querySelector('svg') as SVGSVGElement | null;
  if (!svg) return;

  const pt = getSVGPoint(svg, e);
  startX = pt.x;
  startY = pt.y;

  eraserRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  eraserRect.setAttribute('id', 'eraser-rect');
  eraserRect.setAttribute('x', String(startX));
  eraserRect.setAttribute('y', '0');
  eraserRect.setAttribute('height', svg.getAttribute('height') || '600');
  eraserRect.setAttribute('fill', 'rgba(233,69,96,0.3)');
  eraserRect.setAttribute('stroke', '#e94560');
  eraserRect.setAttribute('stroke-width', '2');
  eraserRect.setAttribute('stroke-dasharray', '5 3');
  svg.appendChild(eraserRect);
}

function handleEraserMove(e: MouseEvent): void {
  if (!isErasing || !eraserRect) return;

  const canvas = document.getElementById('svg-canvas');
  const svg = canvas?.querySelector('svg') as SVGSVGElement | null;
  if (!svg) return;

  const pt = getSVGPoint(svg, e);
  const x = Math.min(startX, pt.x);
  const width = Math.abs(pt.x - startX);

  eraserRect.setAttribute('x', String(x));
  eraserRect.setAttribute('width', String(width));
}

function handleEraserEnd(e: MouseEvent): void {
  if (!isErasing || !eraserRect) return;
  isErasing = false;

  const canvas = document.getElementById('svg-canvas');
  const svg = canvas?.querySelector('svg') as SVGSVGElement | null;
  if (!svg) return;

  const x = parseFloat(eraserRect.getAttribute('x') || '0');
  const width = parseFloat(eraserRect.getAttribute('width') || '0');

  eraserRect.remove();
  eraserRect = null;

  if (width < 5) return;

  applyEraserRegion(svg, x, width);

  document.body.style.cursor = '';
  const eraserBtn = document.getElementById('btn-eraser');
  eraserBtn?.classList.remove('active');
}

function getSVGPoint(svg: SVGSVGElement, e: MouseEvent): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
  return { x: svgP.x, y: svgP.y };
}

function applyEraserRegion(svg: SVGSVGElement, x: number, width: number): void {
  const pixelLayer = svg.querySelector('#pixel-layer');
  const pixelImgEl = pixelLayer?.querySelector('image');
  if (!pixelImgEl) return;

  const svgWidth = parseFloat(svg.getAttribute('width') || '0');
  const svgHeight = parseFloat(svg.getAttribute('height') || '0');

  const x1 = Math.floor(x);
  const x2 = Math.ceil(x + width);

  const existing: Array<{ x1: number; x2: number }> =
    JSON.parse(svg.getAttribute('data-excluded-regions') || '[]');
  existing.push({ x1, x2 });
  svg.setAttribute('data-excluded-regions', JSON.stringify(existing));

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  defs.querySelector('#hq-component-clip')?.remove();

  const clipOuterLeft = -10;
  const clipOuterRight = svgWidth + 10;
  const holes = existing
    .map(r => `M ${r.x1} 0 H ${r.x2} V ${svgHeight} H ${r.x1} Z`)
    .join(' ');
  const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clipPath.setAttribute('id', 'hq-component-clip');
  const maskPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  maskPath.setAttribute('clip-rule', 'evenodd');
  maskPath.setAttribute('d', `M ${clipOuterLeft} 0 H ${clipOuterRight} V ${svgHeight} H ${clipOuterLeft} Z ${holes}`);
  clipPath.appendChild(maskPath);
  defs.appendChild(clipPath);
  pixelImgEl.setAttribute('clip-path', 'url(#hq-component-clip)');

  renderSVG(svg.outerHTML);
  setStatus(`Erased region ${Math.round(x)}–${Math.round(x + width)}`);
}

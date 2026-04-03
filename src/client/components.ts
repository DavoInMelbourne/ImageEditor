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
  document.getElementById('btn-detect-components')!.addEventListener('click', detectHQComponents);
}

export function buildComponentList(): void {
  const listEl = document.getElementById('component-list')!;
  const svgCanvas = document.getElementById('svg-canvas')!;
  const svg = svgCanvas.querySelector('svg');
  if (!svg) { listEl.innerHTML = ''; return; }

  // Collect detected components: vector layer groups + replaced-text images
  const vectorLayer = svg.querySelector('#vector-layer');
  const vectorComponents = vectorLayer
    ? Array.from(vectorLayer.querySelectorAll(':scope > g[data-component]'))
    : [];
  const replacedComponents = Array.from(svg.querySelectorAll('image.replaced-text[data-component]'));
  const detectedComponents = [...vectorComponents, ...replacedComponents];

  const children: Element[] = detectedComponents.length > 0
    ? detectedComponents
    : Array.from(svg.children).filter(el => el.tagName !== 'defs' && el.tagName !== 'style');

  // Keep vector component groups invisible — selection is shown via a highlight rect instead
  if (detectedComponents.length > 0) {
    vectorComponents.forEach(g => (g as SVGElement).setAttribute('style', 'opacity:0'));
    updateSelectionHighlight(svg as SVGSVGElement, detectedComponents as SVGElement[]);
  }

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
      // Prepopulate the find field with the component label
      const label = (child as SVGElement).getAttribute('data-label');
      if (label) {
        const findInput = document.getElementById('text-find') as HTMLInputElement | null;
        if (findInput) findInput.value = `[${label}]`;
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
  const label = el.getAttribute('data-label');
  if (label) return label;

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

/**
 * Show a dashed highlight rect over the currently-selected component group.
 * The pixel image stays fully visible; the rect is just an overlay indicator.
 */
function updateSelectionHighlight(svg: SVGSVGElement, componentGroups: SVGElement[]): void {
  // Remove existing highlight
  svg.querySelector('#component-selection-highlight')?.remove();

  const selected = componentGroups.find(g => state.selectedElements.includes(g));
  if (!selected) return;

  // Use stored pixel-region bounds (much more reliable than getBBox on opacity:0 groups)
  const x1 = parseFloat(selected.getAttribute('data-region-x1') || '');
  const x2 = parseFloat(selected.getAttribute('data-region-x2') || '');
  if (isNaN(x1) || isNaN(x2) || x2 <= x1) return;

  const vb = svg.viewBox?.baseVal;
  const svgHeight = (vb && vb.height > 0) ? vb.height : parseFloat(svg.getAttribute('height') || '600');

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('id', 'component-selection-highlight');
  rect.setAttribute('x', String(Math.floor(x1) - 4));
  rect.setAttribute('y', '0');
  rect.setAttribute('width', String(Math.ceil(x2 - x1) + 8));
  rect.setAttribute('height', String(svgHeight));
  rect.setAttribute('fill', 'rgba(233,69,96,0.15)');
  rect.setAttribute('stroke', 'rgba(233,69,96,0.8)');
  rect.setAttribute('stroke-width', '3');
  rect.setAttribute('stroke-dasharray', '10 6');
  rect.setAttribute('pointer-events', 'none');
  svg.appendChild(rect);
}

export function detectHQComponents(): void {
  const svgCanvas = document.getElementById('svg-canvas')!;
  const svg = svgCanvas.querySelector('svg');
  if (!svg) return;

  const vectorLayer = svg.querySelector('#vector-layer') as SVGGElement | null;
  if (!vectorLayer) {
    setStatus('No vector layer found — use HQ mode when converting');
    return;
  }

  // Get the embedded PNG from the HQ pixel layer
  const imgEl = svg.querySelector('#pixel-layer image');
  const href = imgEl?.getAttribute('href') || imgEl?.getAttribute('xlink:href') || '';
  if (!href.startsWith('data:image')) {
    setStatus('No embedded image found — use HQ mode when converting');
    return;
  }

  const svgEl = svg as SVGSVGElement;
  const vb = svgEl.viewBox?.baseVal;
  const svgWidth = (vb && vb.width > 0) ? vb.width : parseFloat(svg.getAttribute('width') || '800');

  setStatus('Analysing image for components…');

  // Use pixel transparency to find component regions — much more reliable than
  // clustering vector paths, because potrace scatters tiny subpaths across the
  // whole image (anti-aliasing) leaving no usable gaps in the vector data.
  findTransparentGaps(href, svgWidth).then(rawRegions => {
    // Filter out tiny artifact regions (< 3% of SVG width)
    const minRegionWidth = svgWidth * 0.03;
    const regions = rawRegions.filter(r => (r.x2 - r.x1) >= minRegionWidth);

    if (regions.length < 2) {
      setStatus('Only one region detected — image may not have a transparent background between components');
      return;
    }

    // Flatten any existing component groups back to bare paths
    Array.from(vectorLayer.querySelectorAll(':scope > g[data-component]')).forEach(g => {
      Array.from(g.children).forEach(child => vectorLayer.insertBefore(child, g));
      g.remove();
    });

    const paths = Array.from(vectorLayer.querySelectorAll('path'));

    // Split compound paths into subpaths and assign each to a pixel-detected region
    interface SubPath { d: string; fill: string; stroke: string; centerX: number; }
    const allSubPaths: SubPath[] = [];

    paths.forEach(path => {
      const fill = path.getAttribute('fill') || '#000000';
      const stroke = path.getAttribute('stroke') || 'none';
      const subStrs = (path.getAttribute('d') || '').match(/[Mm][^Mm]*/g) || [];
      subStrs.forEach(sub => {
        const range = approximateXRange(sub.trim());
        if (range.maxX <= range.minX) return;
        allSubPaths.push({ d: sub.trim(), fill, stroke, centerX: (range.minX + range.maxX) / 2 });
      });
    });

    // Assign each subpath to nearest region by centerX
    const assigned: SubPath[][] = regions.map(() => []);
    allSubPaths.forEach(sp => {
      let best = 0, bestDist = Infinity;
      regions.forEach((r, i) => {
        const dist = sp.centerX >= r.x1 && sp.centerX <= r.x2
          ? 0
          : Math.min(Math.abs(sp.centerX - r.x1), Math.abs(sp.centerX - r.x2));
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      assigned[best].push(sp);
    });

    // Rebuild vector layer with per-region component groups
    while (vectorLayer.firstChild) vectorLayer.removeChild(vectorLayer.firstChild);

    const positionLabels = getPositionLabels(regions.length);
    assigned.forEach((cluster, i) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', `component-${i}`);
      g.setAttribute('data-component', String(i));
      g.setAttribute('data-label', positionLabels[i]);
      g.setAttribute('data-region-x1', String(regions[i].x1));
      g.setAttribute('data-region-x2', String(regions[i].x2));
      g.setAttribute('data-region-y1', String(regions[i].y1));
      g.setAttribute('data-region-y2', String(regions[i].y2));

      const fillGroups = new Map<string, { fill: string; stroke: string; subpaths: string[] }>();
      cluster.forEach(sp => {
        const key = `${sp.fill}|${sp.stroke}`;
        if (!fillGroups.has(key)) fillGroups.set(key, { fill: sp.fill, stroke: sp.stroke, subpaths: [] });
        fillGroups.get(key)!.subpaths.push(sp.d);
      });

      fillGroups.forEach(({ fill, stroke, subpaths }) => {
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('fill', fill);
        if (stroke !== 'none') pathEl.setAttribute('stroke', stroke);
        pathEl.setAttribute('d', subpaths.join(' '));
        g.appendChild(pathEl);
      });

      // Start invisible — becomes visible (highlighted) when selected
      g.setAttribute('style', 'opacity:0');
      vectorLayer.appendChild(g);
    });

    // Keep vector layer non-interactive — selection is done via the component list panel.
    // pointer-events:all would create invisible click targets over the pixel image.
    vectorLayer.setAttribute('style', 'display:none');

    console.log(`[Detect] Pixel-based regions: ${regions.length}`);
    regions.forEach((r, i) => console.log(`  Region ${i} (${positionLabels[i]}): x ${r.x1.toFixed(0)}–${r.x2.toFixed(0)}`));

    // Reset all groups to invisible (no selection yet)
    Array.from(vectorLayer.querySelectorAll(':scope > g[data-component]')).forEach(g => {
      (g as SVGElement).setAttribute('style', 'opacity:0');
    });

    clearSelection();
    renderSVG(svg.outerHTML);
    setStatus(`Detected ${regions.length} component(s) — click a component name in the list below to select it`);
  });
}

/**
 * Load the embedded PNG into a canvas, scan columns for non-transparent pixels,
 * and return the x-ranges of distinct content regions (in SVG coordinates).
 * Gaps between regions must be at least MIN_GAP_PX pixels in the source image.
 */
interface Region { x1: number; x2: number; y1: number; y2: number; }

function findTransparentGaps(dataUrl: string, svgWidth: number): Promise<Region[]> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, w, h);

      // For each x column, check if any pixel has alpha > threshold
      const ALPHA_THRESHOLD = 20;
      const colHasContent = new Uint8Array(w);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD) colHasContent[x] = 1;
        }
      }

      // Find content runs separated by transparent gaps
      // 2% of width avoids splitting kerned text (e.g. "Beer") while preserving
      // real component gaps (e.g. between "We" and the heart icon).
      const MIN_GAP_PX = Math.max(6, Math.floor(w * 0.02));
      const xRegions: Array<{ x1: number; x2: number }> = [];
      let start = -1, gapLen = 0;

      for (let x = 0; x <= w; x++) {
        const hasContent = x < w && colHasContent[x] === 1;
        if (hasContent) {
          if (start === -1) start = x;
          gapLen = 0;
        } else {
          if (start !== -1) {
            gapLen++;
            if (gapLen >= MIN_GAP_PX) {
              xRegions.push({ x1: start, x2: x - gapLen });
              start = -1; gapLen = 0;
            }
          }
        }
      }
      if (start !== -1) xRegions.push({ x1: start, x2: w - 1 });

      // For each x-region, scan for vertical content bounds (minY / maxY)
      const scale = svgWidth / w;
      const svgHeight = h * scale;
      const regions: Region[] = xRegions.map(r => {
        let minY = h, maxY = 0;
        for (let y = 0; y < h; y++) {
          for (let x = r.x1; x <= r.x2; x++) {
            if (data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD) {
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (minY > maxY) { minY = 0; maxY = h; }
        return { x1: r.x1 * scale, x2: r.x2 * scale, y1: minY * scale, y2: maxY * scale };
      });

      resolve(regions);
    };
    img.onerror = () => resolve([]);
    img.src = dataUrl;
  });
}

function getPositionLabels(count: number): string[] {
  if (count === 1) return ['Center'];
  if (count === 2) return ['Left', 'Right'];
  if (count === 3) return ['Left', 'Center', 'Right'];
  if (count === 4) return ['Far Left', 'Center-Left', 'Center-Right', 'Far Right'];
  // Generic fallback for 5+
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return 'Far Left';
    if (i === count - 1) return 'Far Right';
    return `Section ${i + 1}`;
  });
}

function approximateXRange(d: string): { minX: number; maxX: number } {
  // Only collect ON-CURVE x-coordinates (not bézier control points).
  // Control points can be far outside the actual curve extent, causing adjacent
  // components' x-ranges to overlap and merge into a single cluster.
  // Potrace uses absolute coordinates (uppercase commands) throughout.
  const xs: number[] = [];
  const cmdRe = /([MmLlCcSsQqTtAaHhVvZz])([^MmLlCcSsQqTtAaHhVvZz]*)/g;
  let match: RegExpExecArray | null;
  while ((match = cmdRe.exec(d)) !== null) {
    const type = match[1];
    const vals = [...match[2].matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)]
      .map(m => parseFloat(m[0]));
    switch (type) {
      case 'M': case 'L': case 'T':
        // x at every even index (x,y pairs)
        for (let i = 0; i < vals.length; i += 2) if (!isNaN(vals[i])) xs.push(vals[i]);
        break;
      case 'C':
        // C x1 y1 x2 y2 x y — only the endpoint x (index 4 of each 6-tuple)
        for (let i = 4; i < vals.length; i += 6) if (!isNaN(vals[i])) xs.push(vals[i]);
        break;
      case 'S': case 'Q':
        // S x1 y1 x y / Q x1 y1 x y — endpoint x at index 2 of each 4-tuple
        for (let i = 2; i < vals.length; i += 4) if (!isNaN(vals[i])) xs.push(vals[i]);
        break;
      case 'H':
        xs.push(...vals.filter(v => !isNaN(v)));
        break;
      // Relative commands (m,l,c,h,s,q) and V/v not collected —
      // potrace uses absolute coords so these rarely appear in its output.
    }
  }
  if (xs.length === 0) return { minX: 0, maxX: 0 };
  return { minX: Math.min(...xs), maxX: Math.max(...xs) };
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

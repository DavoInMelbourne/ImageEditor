/**
 * Text replacement in SVGs.
 *
 * Two strategies:
 * 1. If the SVG contains <text> elements, replace their content directly.
 * 2. If no <text> elements exist (e.g. HQ mode with rasterized text), remove
 *    the selected component/paths and overlay a new <text> element in their place.
 *    In HQ mode this also switches from pixel layer to vector layer.
 */
import { state, setStatus } from './state.js';
import { renderSVG } from './canvas.js';

export function initTextReplace(): void {
  const replaceBtn = document.getElementById('btn-replace-text') as HTMLButtonElement;

  replaceBtn.addEventListener('click', () => {
    const findInput = document.getElementById('text-find') as HTMLInputElement;
    const replaceInput = document.getElementById('text-replace') as HTMLInputElement;
    const fontSelect = document.getElementById('text-font') as HTMLSelectElement;

    const findText = findInput.value.trim();
    const replaceText = replaceInput.value.trim();
    const font = fontSelect.value;

    // Allow empty replacement when a component is selected (removes the region)
    if (!replaceText && state.selectedElements.length === 0) {
      setStatus('Please enter replacement text, or select a component to remove');
      return;
    }

    if (replaceText) {
      replaceTextInSVG(findText, replaceText, font);
    } else {
      // Empty replacement = just clip away the selected region
      removeSelectedRegion();
    }
  });
}

function replaceTextInSVG(find: string, replace: string, font: string): void {
  const svgCanvas = document.getElementById('svg-canvas')!;
  const svg = svgCanvas.querySelector('svg');
  if (!svg) return;

  // Strategy 1: Replace in <text> elements (works for native SVG text)
  const textElements = Array.from(svg.querySelectorAll('text'));
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

  // Strategy 2: Replace selected component/paths with a text element
  if (state.selectedElements.length > 0) {
    replaceSelectedWithText(replace, font);
  } else {
    addTextOverlay(svg, replace, font);
  }
}

function replaceSelectedWithText(replace: string, font: string): void {
  const svgCanvas = document.getElementById('svg-canvas')!;
  const svg = svgCanvas.querySelector('svg');
  if (!svg) return;

  const bbox = getSelectedBBox();
  if (!bbox) {
    setStatus('Could not determine bounding box — select a component first');
    return;
  }

  // Extract gradient colors from vector paths BEFORE deleting
  const componentFills = extractComponentFills(state.selectedElements);

  const svgEl = svg as SVGSVGElement;
  const vb = svgEl.viewBox?.baseVal;
  const svgWidth = (vb && vb.width > 0) ? vb.width : parseFloat(svg.getAttribute('width') || '800');
  const svgHeight = (vb && vb.height > 0) ? vb.height : parseFloat(svg.getAttribute('height') || '600');

  const pixelImgEl = svg.querySelector('#pixel-layer image');
  const href = pixelImgEl?.getAttribute('href') || pixelImgEl?.getAttribute('xlink:href') || '';

  // Sample gradient from the original pixel image
  const gradientPromise = (pixelImgEl && href.startsWith('data:image'))
    ? sampleRegionGradient(href, bbox, svgWidth, svgHeight)
    : Promise.resolve(null);

  gradientPromise.then(sampledColors => {
    const gradientColors = hasVisibleVariation(sampledColors) ? sampledColors : componentFills;
    console.log('[TextReplace] Sampled:', sampledColors, 'Fills:', componentFills, 'Using:', gradientColors);

    // --- Render text to canvas, auto-measuring actual pixel bounds ---
    // Use a large canvas first, measure actual text bounds, then crop tightly.
    const canvasScale = 2; // 2x for crisp rendering
    // Don't add 'bold' — fonts like Arial Black are already bold; adding it
    // can cause the browser to pick a synthetic bold or fall back to a different face.
    const fontStr = `${fontSize_base()}px '${font}'`;
    const fontStrScaled = `${fontSize_base() * canvasScale}px '${font}'`;

    // First pass: measure actual text width & height on a temp canvas
    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = 4000; measureCanvas.height = 1000;
    const mctx = measureCanvas.getContext('2d')!;
    mctx.font = fontStrScaled;
    mctx.textBaseline = 'alphabetic';
    mctx.fillStyle = '#fff';
    mctx.fillText(replace, 50, 800);

    // Scan for actual pixel bounds of the rendered text
    const mData = mctx.getImageData(0, 0, measureCanvas.width, measureCanvas.height).data;
    let txMin = measureCanvas.width, txMax = 0, tyMin = measureCanvas.height, tyMax = 0;
    for (let y = 0; y < measureCanvas.height; y++) {
      for (let x = 0; x < measureCanvas.width; x++) {
        if (mData[(y * measureCanvas.width + x) * 4 + 3] > 20) {
          if (x < txMin) txMin = x;
          if (x > txMax) txMax = x;
          if (y < tyMin) tyMin = y;
          if (y > tyMax) tyMax = y;
        }
      }
    }

    const actualW = txMax - txMin + 1;
    const actualH = tyMax - tyMin + 1;
    // Scale factor: make the rendered text height match the original region height
    const targetH = bbox.height * canvasScale;
    const textScaleFactor = targetH / actualH;
    // Add left padding so curved letters (C, O, S…) don't bite into adjacent content
    const leftPad = Math.ceil(actualH * textScaleFactor * 0.10); // ~10% of text height
    const finalW = Math.ceil(actualW * textScaleFactor) + leftPad;
    const finalH = Math.ceil(targetH);
    const textWidth = finalW / canvasScale; // in SVG units

    // Second pass: render at the correct size with gradient
    const offscreen = document.createElement('canvas');
    offscreen.width = finalW;
    offscreen.height = finalH;
    const ctx = offscreen.getContext('2d')!;

    // Create vertical gradient
    if (gradientColors && gradientColors.length >= 2) {
      const canvasGrad = ctx.createLinearGradient(0, 0, 0, finalH);
      gradientColors.forEach((color, i) => {
        canvasGrad.addColorStop(i / (gradientColors.length - 1), color);
      });
      ctx.fillStyle = canvasGrad;
    } else {
      ctx.fillStyle = componentFills.length > 0
        ? componentFills[Math.floor(componentFills.length / 2)]
        : '#c8922a';
    }

    // Draw scaled text — position so that the actual glyph pixels fill the canvas
    const scaledFontSize = fontSize_base() * canvasScale * textScaleFactor;
    ctx.font = `${scaledFontSize}px '${font}'`;
    ctx.textBaseline = 'alphabetic';
    // Offset so the measured top-left maps to canvas origin (+ left padding)
    const drawX = -txMin * textScaleFactor + leftPad;
    const drawY = -tyMin * textScaleFactor + (800 - tyMin) * 0 + (finalH - actualH * textScaleFactor) / 2 + actualH * textScaleFactor * 0.82 / 0.82;
    // Simpler: baseline offset. tyMin was the top of text at baseline=800.
    // Glyph top = tyMin, glyph bottom = tyMax. We want glyph to fill [0, finalH].
    const baselineInGlyph = 800 - tyMin; // distance from glyph top to baseline
    const baselineScaled = baselineInGlyph * textScaleFactor;
    ctx.fillText(replace, drawX, baselineScaled);

    const rasterDataUrl = offscreen.toDataURL('image/png');

    // Helper: base font size (unscaled) — used in measurements
    function fontSize_base(): number { return bbox.height * 1.5; }

    // --- Layout reflow ---
    const allRegions: Array<{ x1: number; x2: number; label: string }> = [];
    svg.querySelectorAll('#vector-layer g[data-component]').forEach(g => {
      allRegions.push({
        x1: parseFloat(g.getAttribute('data-region-x1') || '0'),
        x2: parseFloat(g.getAttribute('data-region-x2') || '0'),
        label: g.getAttribute('data-label') || '',
      });
    });

    const heartRegion = allRegions.find(r => r.label === 'Center')
      || allRegions.find(r => r.label === 'Center-Left')
      || (allRegions.length >= 2 ? allRegions[1] : null);
    const leftRegion = allRegions.length > 0 ? allRegions[0] : null;

    const gapAfterHeart = heartRegion ? (bbox.x - heartRegion.x2) : 0;
    const newTextLeft = heartRegion ? (heartRegion.x2 + gapAfterHeart) : bbox.x;
    const newTextRight = newTextLeft + textWidth;

    const contentLeft = leftRegion ? leftRegion.x1 : 0;
    const contentRight = newTextRight;

    // New viewBox: equal outer margins
    const margin = 20;
    const newViewBoxWidth = (contentRight - contentLeft) + margin * 2;
    const viewBoxX = contentLeft - margin;

    if (pixelImgEl) {
      // Clip the pixel image to hide the replaced region
      const clipX1 = Math.floor(Math.min(bbox.x, newTextLeft)) - 4;
      const clipX2 = Math.ceil(Math.max(bbox.x + bbox.width, newTextRight)) + 4;

      const existing: Array<{ x1: number; x2: number }> =
        JSON.parse(svg.getAttribute('data-excluded-regions') || '[]');
      existing.push({ x1: clipX1, x2: clipX2 });
      svg.setAttribute('data-excluded-regions', JSON.stringify(existing));

      let defs = svg.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
      }

      defs.querySelector('#hq-component-clip')?.remove();

      const clipOuterLeft = Math.min(0, viewBoxX) - 10;
      const clipOuterRight = Math.max(svgWidth, viewBoxX + newViewBoxWidth) + 10;
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
    } else {
      state.selectedElements.forEach(el => el.parentNode?.removeChild(el));
    }

    // Remove selected component group from vector layer
    state.selectedElements.forEach(el => el.parentNode?.removeChild(el));
    state.selectedElements = [];

    // Embed the canvas-rendered text as a raster <image> element
    const imgEl = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    imgEl.setAttribute('href', rasterDataUrl);
    imgEl.setAttribute('x', String(newTextLeft));
    imgEl.setAttribute('y', String(bbox.y));
    imgEl.setAttribute('width', String(textWidth));
    imgEl.setAttribute('height', String(bbox.height));
    imgEl.setAttribute('preserveAspectRatio', 'none');
    imgEl.setAttribute('class', 'replaced-text');
    // Register as a component so it can be re-selected, changed, or removed later
    imgEl.setAttribute('data-component', 'replaced');
    imgEl.setAttribute('data-label', replace);
    imgEl.setAttribute('data-region-x1', String(newTextLeft));
    imgEl.setAttribute('data-region-x2', String(newTextRight));
    imgEl.setAttribute('data-region-y1', String(bbox.y));
    imgEl.setAttribute('data-region-y2', String(bbox.y + bbox.height));
    // Inherit any recolor filter already applied to the pixel layer
    const pixelLayerFilter = svg.querySelector('#pixel-layer')?.getAttribute('filter');
    if (pixelLayerFilter) imgEl.setAttribute('filter', pixelLayerFilter);
    svg.appendChild(imgEl);

    // Apply the recentered viewBox
    svgEl.setAttribute('viewBox', `${viewBoxX} 0 ${newViewBoxWidth} ${svgHeight}`);

    renderSVG(svg.outerHTML);
    setStatus(`Replaced component with "${replace}"`);
  });
}

/** Remove a selected component region by clipping it from the pixel image (no replacement text). */
function removeSelectedRegion(): void {
  const svgCanvas = document.getElementById('svg-canvas')!;
  const svg = svgCanvas.querySelector('svg');
  if (!svg) return;

  // If the selected element is a replaced-text image, just remove it directly
  const isReplacedText = state.selectedElements.some(
    el => el.classList.contains('replaced-text')
  );
  if (isReplacedText) {
    state.selectedElements.forEach(el => el.parentNode?.removeChild(el));
    state.selectedElements = [];
    renderSVG(svg.outerHTML);
    setStatus('Removed replaced text');
    return;
  }

  const bbox = getSelectedBBox();
  if (!bbox) { setStatus('Select a component first'); return; }

  const svgEl = svg as SVGSVGElement;
  const vb = svgEl.viewBox?.baseVal;
  const svgWidth = (vb && vb.width > 0) ? vb.width : parseFloat(svg.getAttribute('width') || '800');
  const svgHeight = (vb && vb.height > 0) ? vb.height : parseFloat(svg.getAttribute('height') || '600');

  const pixelImgEl = svg.querySelector('#pixel-layer image');
  if (pixelImgEl) {
    const existing: Array<{ x1: number; x2: number }> =
      JSON.parse(svg.getAttribute('data-excluded-regions') || '[]');
    existing.push({ x1: Math.floor(bbox.x) - 4, x2: Math.ceil(bbox.x + bbox.width) + 4 });
    svg.setAttribute('data-excluded-regions', JSON.stringify(existing));

    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    defs.querySelector('#hq-component-clip')?.remove();

    const holes = existing.map(r => `M ${r.x1} 0 H ${r.x2} V ${svgHeight} H ${r.x1} Z`).join(' ');
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', 'hq-component-clip');
    const maskPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    maskPath.setAttribute('clip-rule', 'evenodd');
    maskPath.setAttribute('d', `M -10 0 H ${svgWidth + 10} V ${svgHeight} H -10 Z ${holes}`);
    clipPath.appendChild(maskPath);
    defs.appendChild(clipPath);
    pixelImgEl.setAttribute('clip-path', 'url(#hq-component-clip)');
  }

  state.selectedElements.forEach(el => el.parentNode?.removeChild(el));
  state.selectedElements = [];

  renderSVG(svg.outerHTML);
  setStatus('Removed selected region');
}

/** Extract unique fill colors from component paths, sorted dark-to-light (for top-to-bottom gradient). */
function extractComponentFills(elements: SVGElement[]): string[] {
  const fills = new Set<string>();
  elements.forEach(el => {
    const f = el.getAttribute('fill');
    if (f && f !== 'none' && !f.startsWith('url(')) fills.add(f);
    el.querySelectorAll('[fill]').forEach(child => {
      const cf = child.getAttribute('fill');
      if (cf && cf !== 'none' && !cf.startsWith('url(')) fills.add(cf);
    });
  });

  // Sort by luminance (dark first = top of gradient)
  return Array.from(fills).sort((a, b) => hexLuminance(a) - hexLuminance(b));
}

function hexLuminance(hex: string): number {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 0.5;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Check if sampled colors have enough variation to be a visible gradient. */
function hasVisibleVariation(colors: string[] | null): colors is string[] {
  if (!colors || colors.length < 2) return false;
  const lums = colors.map(hexLuminance);
  const range = Math.max(...lums) - Math.min(...lums);
  return range > 0.08; // require >8% luminance variation
}

/**
 * Sample the dominant colors at several vertical positions within a region of the
 * embedded PNG. Returns an array of hex colors from top to bottom (for a vertical
 * gradient), or null if sampling fails.
 */
function sampleRegionGradient(
  dataUrl: string,
  bbox: { x: number; y: number; width: number; height: number },
  svgWidth: number,
  svgHeight: number,
): Promise<string[] | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const scaleX = w / svgWidth, scaleY = h / svgHeight;

      // Map SVG bbox to pixel coordinates
      const px1 = Math.max(0, Math.floor(bbox.x * scaleX));
      const px2 = Math.min(w - 1, Math.ceil((bbox.x + bbox.width) * scaleX));
      const py1 = Math.max(0, Math.floor(bbox.y * scaleY));
      const py2 = Math.min(h - 1, Math.ceil((bbox.y + bbox.height) * scaleY));
      if (px2 <= px1 || py2 <= py1) { resolve(null); return; }

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, w, h);

      // Sample 5 horizontal bands across the vertical extent of the region
      const BANDS = 5;
      const colors: string[] = [];
      for (let band = 0; band < BANDS; band++) {
        const y = py1 + Math.floor((py2 - py1) * band / (BANDS - 1));
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let x = px1; x <= px2; x++) {
          const idx = (y * w + x) * 4;
          const a = data[idx + 3];
          if (a < 50) continue; // skip transparent pixels
          rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2];
          count++;
        }
        if (count > 0) {
          const r = Math.round(rSum / count);
          const g = Math.round(gSum / count);
          const b = Math.round(bSum / count);
          colors.push(`#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`);
        }
      }

      // Need at least 2 distinct-ish colors for a gradient
      resolve(colors.length >= 2 ? colors : null);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function addTextOverlay(svg: Element, replace: string, font: string): void {
  const svgEl = svg as SVGSVGElement;
  const vb = svgEl.viewBox?.baseVal;
  const width = (vb && vb.width > 0) ? vb.width : parseFloat(svg.getAttribute('width') || '800');
  const height = (vb && vb.height > 0) ? vb.height : parseFloat(svg.getAttribute('height') || '400');

  const fills = Array.from(svg.querySelectorAll('[fill]'))
    .map(el => el.getAttribute('fill'))
    .filter(f => f && f !== 'none' && !f.startsWith('url('));
  const color = fills[0] || '#333';

  const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
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
  setStatus(`Added text overlay — use Detect Components + select a component for precise replacement`);
}

function getSelectedBBox(): { x: number; y: number; width: number; height: number } | null {
  if (state.selectedElements.length === 0) return null;

  // First try stored pixel-region bounds (reliable for detected components)
  const el = state.selectedElements[0];
  const rx1 = el.getAttribute('data-region-x1');
  const rx2 = el.getAttribute('data-region-x2');
  const ry1 = el.getAttribute('data-region-y1');
  const ry2 = el.getAttribute('data-region-y2');
  if (rx1 && rx2) {
    const x1 = parseFloat(rx1), x2 = parseFloat(rx2);
    const y1 = parseFloat(ry1 || '0'), y2 = parseFloat(ry2 || '0');
    if (!isNaN(x1) && !isNaN(x2) && x2 > x1) {
      const height = (y2 > y1) ? (y2 - y1) : x2 - x1; // fallback to square-ish
      return { x: x1, y: y1, width: x2 - x1, height };
    }
  }

  // Fallback: getBBox (works for native SVG elements)
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

    // Check children (e.g. when a component group is selected)
    const child = el.querySelector('[fill]');
    if (child) {
      const childFill = child.getAttribute('fill');
      if (childFill && childFill !== 'none' && !childFill.startsWith('url(')) return childFill;
    }
  }
  return '#333333';
}

/**
 * Color palette recoloring — maps all colours to a new palette
 * while preserving luminance relationships.
 */
import { setStatus } from './state.js';
import { renderSVG, getCurrentSVG } from './canvas.js';
import { log } from './logger.js';

export function initPalette(): void {
  const colorInput = document.getElementById('palette-color') as HTMLInputElement;
  const recolorBtn = document.getElementById('btn-recolor') as HTMLButtonElement;
  const colorWheel = document.getElementById('color-wheel') as HTMLCanvasElement;
  const lightnessSlider = document.getElementById('lightness-slider') as HTMLInputElement;
  const lightnessVal = document.getElementById('lightness-val')!;
  const hexLabel = document.getElementById('palette-hex')!;
  const previewDark = document.getElementById('preview-dark')!;
  const previewLight = document.getElementById('preview-light')!;
  const depthSlider = document.getElementById('depth-slider') as HTMLInputElement;
  const depthVal = document.getElementById('depth-val')!;

  let currentLightness = 50;
  let pickedHue = 0;   // 0..1
  let pickedSat = 0;   // 0..1
  let hasPicked = false;

  function updateSelectedColor(hex: string): void {
    colorInput.value = hex;
    hexLabel.textContent = hex;
    updateGradientPreview();
  }

  /** Show dark/light preview swatches. Left = exact picked color, right = proportionally lighter. */
  function updateGradientPreview(): void {
    const baseHSL = hexToHSL(colorInput.value);
    const depth = parseInt(depthSlider.value) / 100;

    // Left box = exact picked color (what the darkest parts of the image will become)
    previewDark.style.background = colorInput.value;

    // Right box = light end of the recolored range (matches what the matrix produces for white areas).
    // Depth shifts the light end: negative = more contrast, positive = more washed out.
    const lightL = Math.min(0.97, baseHSL.l + 0.45 + depth * 0.2);
    const lightS = Math.max(0.05, baseHSL.s * (0.4 + depth * 0.15));
    const lightHSL = { h: baseHSL.h, s: lightS, l: lightL };
    previewLight.style.background = hslToCss(lightHSL);

    hexLabel.textContent = colorInput.value;
  }

  function hslToCss(hsl: HSL): string {
    return `hsl(${Math.round(hsl.h * 360)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`;
  }

  // Draw the color wheel
  function drawWheel(): void {
    const ctx = colorWheel.getContext('2d')!;
    const w = colorWheel.width;
    const h = colorWheel.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 2;

    ctx.clearRect(0, 0, w, h);

    // Draw HSL wheel
    const imageData = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= radius) {
          const angle = Math.atan2(dy, dx);
          const hue = ((angle * 180 / Math.PI) + 360) % 360;
          const sat = dist / radius;
          const rgb = hslToRGB({ h: hue / 360, s: sat, l: currentLightness / 100 });
          const idx = (y * w + x) * 4;
          imageData.data[idx] = rgb.r;
          imageData.data[idx + 1] = rgb.g;
          imageData.data[idx + 2] = rgb.b;
          imageData.data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Anti-alias the circle edge
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  drawWheel();
  updateGradientPreview();

  // Click on wheel to pick color
  colorWheel.addEventListener('click', (e: MouseEvent) => {
    const rect = colorWheel.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scaleX = colorWheel.width / rect.width;
    const scaleY = colorWheel.height / rect.height;
    const px = x * scaleX;
    const py = y * scaleY;

    const cx = colorWheel.width / 2;
    const cy = colorWheel.height / 2;
    const dx = px - cx;
    const dy = py - cy;
    const radius = Math.min(cx, cy) - 2;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= radius) {
      const angle = Math.atan2(dy, dx);
      const hue = ((angle * 180 / Math.PI) + 360) % 360;
      const sat = dist / radius;
      pickedHue = hue / 360;
      pickedSat = sat;
      hasPicked = true;
      const rgb = hslToRGB({ h: pickedHue, s: pickedSat, l: currentLightness / 100 });
      const hex = rgbToHex(rgb);
      updateSelectedColor(hex);
    }
  });

  // Lightness slider
  lightnessSlider.addEventListener('input', () => {
    currentLightness = parseInt(lightnessSlider.value);
    lightnessVal.textContent = `${currentLightness}%`;
    drawWheel();
    if (hasPicked) {
      const rgb = hslToRGB({ h: pickedHue, s: pickedSat, l: currentLightness / 100 });
      updateSelectedColor(rgbToHex(rgb));
    } else {
      updateGradientPreview();
    }
  });

  // Native color input sync
  colorInput.addEventListener('input', () => {
    hexLabel.textContent = colorInput.value;
    updateGradientPreview();
  });

  // Depth slider updates preview in real-time
  depthSlider.addEventListener('input', () => {
    depthVal.textContent = depthSlider.value;
    updateGradientPreview();
  });

  recolorBtn.addEventListener('click', () => {
    const depth = parseInt(depthSlider.value) / 100; // -1 to +1
    recolorImage(colorInput.value, depth);
  });
}

function recolorImage(baseColorHex: string, depth: number = 0): void {
  const svgString = getCurrentSVG();
  if (!svgString) return;

  const baseHSL = hexToHSL(baseColorHex);
  log.info('Recoloring to', baseColorHex, 'HSL:', baseHSL);

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return;

  // Detect HQ mode: has an embedded <image> in a pixel-layer group
  const pixelLayer = doc.getElementById('pixel-layer');
  const imageEl = doc.querySelector('image');

  if (pixelLayer && imageEl) {
    log.info('HQ mode detected — applying SVG filter recoloring');
    recolorHQMode(doc, svg, imageEl, baseHSL, baseColorHex, depth);
  } else {
    log.info('Vector mode — recoloring path fills');
    recolorVectorMode(doc, svg, baseHSL, baseColorHex);
  }
}

/**
 * HQ mode: apply color transformation using SVG feColorMatrix filter
 * on the embedded <image> element.
 *
 * We compute a color matrix that shifts the original hue to the target hue
 * while preserving luminance.
 */
function recolorHQMode(
  doc: Document,
  svg: SVGSVGElement,
  imageEl: Element,
  baseHSL: HSL,
  baseColorHex: string,
  depth: number = 0,
): void {
  // Duotone luminance-mapping matrix:
  // Maps the original image's luminance range [DARK_L, LIGHT_L] exactly onto
  // [picked dark color, computed light color]. Dark areas of the image become
  // exactly the picked color; light areas become the computed light color.
  // For a grey input (R=G=B=v): out = lerp(dark, light, (v - DARK_L) / RANGE)
  // Calibrate to the full 0..1 luminance range so no pixels are clamped/clipped.
  // Black (L=0) → picked dark color exactly; white (L=1) → computed light color.
  const ORIGINAL_DARK_L = 0;
  const ORIGINAL_LIGHT_L = 1;
  const ORIGINAL_RANGE = ORIGINAL_LIGHT_L - ORIGINAL_DARK_L;

  const darkRGB = hexToRGB(baseColorHex);
  const darkR = darkRGB.r / 255;
  const darkG = darkRGB.g / 255;
  const darkB = darkRGB.b / 255;

  const lightHSL = {
    h: baseHSL.h,
    s: Math.max(0.05, baseHSL.s * (0.4 + depth * 0.15)),
    l: Math.min(0.97, baseHSL.l + 0.45 + depth * 0.2),
  };
  const lightRGB = hslToRGB(lightHSL);
  const lightR = lightRGB.r / 255;
  const lightG = lightRGB.g / 255;
  const lightB = lightRGB.b / 255;

  const lumR = 0.213, lumG = 0.715, lumB = 0.072;
  const slopeR = (lightR - darkR) / ORIGINAL_RANGE;
  const slopeG = (lightG - darkG) / ORIGINAL_RANGE;
  const slopeB = (lightB - darkB) / ORIGINAL_RANGE;

  const matrix = [
    slopeR * lumR, slopeR * lumG, slopeR * lumB, 0, darkR - slopeR * ORIGINAL_DARK_L,
    slopeG * lumR, slopeG * lumG, slopeG * lumB, 0, darkG - slopeG * ORIGINAL_DARK_L,
    slopeB * lumR, slopeB * lumG, slopeB * lumB, 0, darkB - slopeB * ORIGINAL_DARK_L,
    0, 0, 0, 1, 0,
  ];

  const matrixStr = matrix.map(v => v.toFixed(4)).join(' ');

  // Find or create the filter
  let defs = doc.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  let filter = doc.getElementById('recolor-filter');
  if (filter) {
    filter.innerHTML = '';
  } else {
    filter = doc.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'recolor-filter');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    defs.appendChild(filter);
  }

  const feMatrix = doc.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
  feMatrix.setAttribute('type', 'matrix');
  feMatrix.setAttribute('values', matrixStr);
  filter.appendChild(feMatrix);

  // Apply filter to the pixel layer and any replaced-text images
  const pixelLayer = doc.getElementById('pixel-layer');
  if (pixelLayer) {
    pixelLayer.setAttribute('filter', 'url(#recolor-filter)');
  }
  doc.querySelectorAll('image.replaced-text').forEach(img => {
    img.setAttribute('filter', 'url(#recolor-filter)');
  });

  // Also recolor the vector layer if visible
  const vectorLayer = doc.getElementById('vector-layer');
  if (vectorLayer) {
    const paths = vectorLayer.querySelectorAll('path');
    paths.forEach(path => {
      const fill = path.getAttribute('fill');
      if (fill && fill !== 'none') {
        const rgb = parseColor(fill);
        if (rgb) {
          const newColor = mapColorToNewPalette(rgb, baseHSL);
          path.setAttribute('fill', newColor);
        }
      }
    });
  }

  renderSVG(svg.outerHTML);
  setStatus(`Recolored image to ${baseColorHex}`);
  log.info('Applied feColorMatrix filter, hue rotation:', targetHueDeg - 30, '°');
}

function recolorVectorMode(
  doc: Document,
  svg: SVGSVGElement,
  baseHSL: HSL,
  baseColorHex: string
): void {
  let recolored = 0;

  const allElements = doc.querySelectorAll('*');
  allElements.forEach(el => {
    recolored += recolorAttribute(el, 'fill', baseHSL);
    recolored += recolorAttribute(el, 'stroke', baseHSL);

    const style = el.getAttribute('style');
    if (style) {
      let newStyle = style;
      newStyle = recolorStyleProperty(newStyle, 'fill', baseHSL);
      newStyle = recolorStyleProperty(newStyle, 'stroke', baseHSL);
      newStyle = recolorStyleProperty(newStyle, 'stop-color', baseHSL);
      if (newStyle !== style) {
        el.setAttribute('style', newStyle);
        recolored++;
      }
    }
  });

  const stops = doc.querySelectorAll('stop');
  stops.forEach(stop => {
    recolored += recolorAttribute(stop, 'stop-color', baseHSL);
  });

  renderSVG(svg.outerHTML);
  setStatus(`Recolored ${recolored} attributes to ${baseColorHex}`);
  log.info('Recolored', recolored, 'vector attributes');
}

interface HSL { h: number; s: number; l: number; }

function recolorAttribute(el: Element, attr: string, baseHSL: HSL): number {
  const val = el.getAttribute(attr);
  if (!val || val === 'none' || val === 'inherit' || val.startsWith('url(')) return 0;

  const rgb = parseColor(val);
  if (!rgb) return 0;

  const newColor = mapColorToNewPalette(rgb, baseHSL);
  el.setAttribute(attr, newColor);
  return 1;
}

function recolorStyleProperty(style: string, prop: string, baseHSL: HSL): string {
  const regex = new RegExp(`(${prop}\\s*:\\s*)(#[0-9a-fA-F]{3,8}|rgb\\([^)]+\\)|[a-z]+)(\\s*[;]?)`, 'gi');
  return style.replace(regex, (match, prefix, colorStr, suffix) => {
    if (colorStr === 'none' || colorStr === 'inherit' || colorStr.startsWith('url(')) return match;
    const rgb = parseColor(colorStr);
    if (!rgb) return match;
    const newColor = mapColorToNewPalette(rgb, baseHSL);
    return `${prefix}${newColor}${suffix}`;
  });
}

function recolorColorMatrix(matrix: Element, baseHSL: HSL): number {
  // Convert the base color's hue rotation into a simple color matrix
  const baseRGB = hslToRGB(baseHSL);
  const r = baseRGB.r / 255;
  const g = baseRGB.g / 255;
  const b = baseRGB.b / 255;

  // Create a matrix that maps through our target color
  const values = [
    `${r.toFixed(3)} 0 0 0 0`,
    `0 ${g.toFixed(3)} 0 0 0`,
    `0 0 ${b.toFixed(3)} 0 0`,
    `0 0 0 1 0`
  ].join(' ');

  matrix.setAttribute('values', values);
  return 1;
}

/**
 * Map a source color to the new palette.
 * The base color is the lightest shade; darker shades are proportionally darker.
 */
function mapColorToNewPalette(rgb: RGB, baseHSL: HSL): string {
  const sourceHSL = rgbToHSL(rgb);

  // Use the base hue and saturation, but preserve relative luminance
  const newH = baseHSL.h;
  const newS = baseHSL.s * (sourceHSL.s > 0 ? Math.min(sourceHSL.s / Math.max(sourceHSL.s, 0.01), 1.5) : 0);
  const newL = mapLuminance(sourceHSL.l, baseHSL.l);

  const newRGB = hslToRGB({ h: newH, s: Math.min(newS, 1), l: Math.min(Math.max(newL, 0), 1) });
  return rgbToHex(newRGB);
}

/**
 * Map source luminance to the new palette range.
 * Base color luminance = lightest; darker proportionally.
 */
function mapLuminance(sourceLum: number, baseLum: number): number {
  // The base color represents the lightest shade
  // Scale luminance proportionally
  return sourceLum * (baseLum / Math.max(getLightest(), 0.01));
}

function getLightest(): number {
  // Approximate: most SVGs have light colors around 0.8-0.95
  return 0.85;
}

// ---- Color conversion utilities ----

interface RGB { r: number; g: number; b: number; }

function parseColor(str: string): RGB | null {
  str = str.trim().toLowerCase();

  // Named colors (common ones)
  const named: Record<string, string> = {
    white: '#ffffff', black: '#000000', red: '#ff0000',
    green: '#008000', blue: '#0000ff', yellow: '#ffff00',
    orange: '#ffa500', purple: '#800080', transparent: '',
  };
  if (named[str] !== undefined) {
    if (!named[str]) return null;
    str = named[str];
  }

  // Hex
  if (str.startsWith('#')) {
    return hexToRGB(str);
  }

  // rgb()
  const rgbMatch = str.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
  }

  return null;
}

function hexToRGB(hex: string): RGB {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function rgbToHSL(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;

  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h, s, l };
}

function hslToRGB(hsl: HSL): RGB {
  const { h, s, l } = hsl;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

export function hexToHSL(hex: string): HSL {
  return rgbToHSL(hexToRGB(hex));
}

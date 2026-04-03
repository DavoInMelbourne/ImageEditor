import potrace from 'potrace';
import sharp from 'sharp';
import fs from 'fs';

export interface ConvertOptions {
  mode: 'color' | 'mono' | 'hq';
  threshold: number;
  turdSize: number;
  nColors: number;
  color: string;
}

export interface ConvertResult {
  svg: string;
  width: number;
  height: number;
}

export async function convertPngToSvg(filePath: string, options: ConvertOptions): Promise<ConvertResult> {
  const metadata = await sharp(filePath).metadata();
  const origW = metadata.width || 800;
  const origH = metadata.height || 600;

  // Resize very large images for tractable tracing, but keep good resolution
  const MAX_DIM = 1200;
  let pipeline = sharp(filePath);
  if (origW > MAX_DIM || origH > MAX_DIM) {
    pipeline = pipeline.resize(MAX_DIM, MAX_DIM, { fit: 'inside' });
  }
  const pngBuffer = await pipeline.png().toBuffer();
  const tmpPng = filePath + '.png';
  fs.writeFileSync(tmpPng, pngBuffer);

  try {
    let svg: string;
    if (options.mode === 'hq') {
      svg = await createHQSvg(pngBuffer, origW, origH, tmpPng, options);
    } else if (options.mode === 'color') {
      svg = await traceColorMultiLayer(tmpPng, pngBuffer, options);
    } else {
      svg = await traceMono(tmpPng, options);
    }

    return {
      svg,
      width: origW,
      height: origH,
    };
  } finally {
    cleanup(filePath, tmpPng);
  }
}

/**
 * High-quality mode: embeds the original PNG as a base64 <image> element
 * with vector trace layers on top for editing. This gives pixel-perfect
 * rendering while still allowing recoloring via SVG filters.
 */
async function createHQSvg(
  pngBuffer: Buffer,
  origW: number,
  origH: number,
  tmpPng: string,
  options: ConvertOptions
): Promise<string> {
  const base64 = pngBuffer.toString('base64');

  // Also create a vector trace for the outline/structure (used for selection, splitting)
  const vectorLayers = await traceColorMultiLayer(tmpPng, pngBuffer, options);
  // Extract just the path elements from the vector trace
  const pathMatches = vectorLayers.match(/<path[^]*?\/>/g) || [];

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${origW}" height="${origH}" viewBox="0 0 ${origW} ${origH}" version="1.1">
  <defs>
    <filter id="hue-rotate-filter">
      <feColorMatrix type="hueRotate" values="0"/>
    </filter>
  </defs>
  <g id="pixel-layer">
    <image width="${origW}" height="${origH}" xlink:href="data:image/png;base64,${base64}" preserveAspectRatio="xMidYMid meet"/>
  </g>
  <g id="vector-layer" style="display:none">
    ${pathMatches.join('\n    ')}
  </g>
</svg>`;
}

/**
 * Multi-layer color tracing:
 * 1. Quantize the image to N representative colors using sharp
 * 2. For each color, create a mask and trace it separately
 * 3. Combine layers into a single SVG with correct fill colors
 */
async function traceColorMultiLayer(filePath: string, pngBuffer: Buffer, options: ConvertOptions): Promise<string> {
  const meta = await sharp(pngBuffer).metadata();
  const w = meta.width!;
  const h = meta.height!;

  // Quantize to extract dominant colors
  const quantized = await sharp(pngBuffer)
    .png({ palette: true, colours: options.nColors, dither: 0 })
    .toBuffer();

  // Get raw pixel data from both original and quantized
  const origPixels = await sharp(pngBuffer).raw().ensureAlpha().toBuffer();
  const quantPixels = await sharp(quantized).raw().ensureAlpha().toBuffer();

  // Extract unique colors from quantized image (ignoring near-transparent pixels)
  const colorMap = new Map<string, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i < quantPixels.length; i += 4) {
    const a = quantPixels[i + 3];
    if (a < 128) continue; // skip transparent
    const r = quantPixels[i], g = quantPixels[i + 1], b = quantPixels[i + 2];
    const key = `${r},${g},${b}`;
    const existing = colorMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      colorMap.set(key, { r, g, b, count: 1 });
    }
  }

  // Use original image colors: sample the original pixels at quantized color positions
  // to get the actual rich colors (quantized colors can be dull)
  const origColorMap = new Map<string, { totalR: number; totalG: number; totalB: number; count: number }>();
  for (let i = 0; i < quantPixels.length; i += 4) {
    const a = quantPixels[i + 3];
    if (a < 128) continue;
    const qr = quantPixels[i], qg = quantPixels[i + 1], qb = quantPixels[i + 2];
    const key = `${qr},${qg},${qb}`;
    const or = origPixels[i], og = origPixels[i + 1], ob = origPixels[i + 2];
    const existing = origColorMap.get(key);
    if (existing) {
      existing.totalR += or;
      existing.totalG += og;
      existing.totalB += ob;
      existing.count++;
    } else {
      origColorMap.set(key, { totalR: or, totalG: og, totalB: ob, count: 1 });
    }
  }

  // Sort by luminance: lightest first (painted first), darkest layers on top
  const colors = [...colorMap.entries()]
    .sort((a, b) => {
      const lumA = a[1].r * 0.299 + a[1].g * 0.587 + a[1].b * 0.114;
      const lumB = b[1].r * 0.299 + b[1].g * 0.587 + b[1].b * 0.114;
      return lumB - lumA; // lightest first
    });

  // Trace each color layer
  const layers: string[] = [];

  for (const [colorKey, colorInfo] of colors) {
    // Get the averaged original color for richer results
    const origColor = origColorMap.get(colorKey);
    let fillR: number, fillG: number, fillB: number;
    if (origColor && origColor.count > 0) {
      fillR = Math.round(origColor.totalR / origColor.count);
      fillG = Math.round(origColor.totalG / origColor.count);
      fillB = Math.round(origColor.totalB / origColor.count);
    } else {
      fillR = colorInfo.r;
      fillG = colorInfo.g;
      fillB = colorInfo.b;
    }

    const fillHex = `#${toHex(fillR)}${toHex(fillG)}${toHex(fillB)}`;

    // Create a binary mask: BLACK where this color exists, WHITE elsewhere
    // (potrace traces black regions by default)
    const mask = Buffer.alloc(w * h, 255); // start all white
    for (let px = 0; px < quantPixels.length / 4; px++) {
      const i = px * 4;
      const a = quantPixels[i + 3];
      if (a < 128) continue;
      const r = quantPixels[i], g = quantPixels[i + 1], b = quantPixels[i + 2];
      if (`${r},${g},${b}` === colorKey) {
        mask[px] = 0; // black = trace this
      }
    }

    // Write mask as PNG
    const maskPng = await sharp(mask, { raw: { width: w, height: h, channels: 1 } })
      .png()
      .toBuffer();

    const maskPath = filePath + `.mask_${colorKey.replace(/,/g, '_')}.png`;
    fs.writeFileSync(maskPath, maskPng);

    try {
      const svgLayer = await traceSingleColor(maskPath, fillHex, options);
      if (svgLayer) layers.push(svgLayer);
    } finally {
      cleanup(maskPath);
    }
  }

  // Compose final SVG
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" version="1.1">\n${layers.join('\n')}\n</svg>`;
}

function traceSingleColor(maskPath: string, fillColor: string, options: ConvertOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    potrace.trace(maskPath, {
      threshold: 128,
      turdSize: options.turdSize,
      color: fillColor,
    }, (err: Error | null, svg: string) => {
      if (err) { reject(err); return; }
      // Extract just the <path> elements from the SVG, skip the wrapper
      const paths = svg.match(/<path[^>]*\/>/g);
      if (paths && paths.length > 0) {
        resolve(paths.join('\n'));
      } else {
        resolve('');
      }
    });
  });
}

function traceMono(filePath: string, options: ConvertOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    potrace.trace(filePath, {
      threshold: options.threshold,
      turdSize: options.turdSize,
      color: options.color === 'auto' ? potrace.Potrace.COLOR_AUTO : options.color,
    }, (err: Error | null, svg: string) => {
      if (err) reject(err);
      else resolve(svg);
    });
  });
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

function cleanup(...files: string[]): void {
  files.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
}

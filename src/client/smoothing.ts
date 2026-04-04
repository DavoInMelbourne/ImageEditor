/**
 * SVG path smoothing — reduces noise in traced vector paths.
 *
 * Strategy: parse each subpath into its bezier segments (preserving all
 * control points), apply Laplacian smoothing to the anchor positions only,
 * then shift each control point by the same delta as its associated anchor.
 *
 * This keeps the bezier structure and local curve shapes intact — only the
 * anchor positions move, and the control points ride along with them.
 * No rebuilding with Catmull-Rom; the original curves are never discarded.
 */
import { setStatus } from './state.js';
import { renderSVG, getCurrentSVG } from './canvas.js';
import { log } from './logger.js';

export function initSmoothing(): void {
  const smoothSlider = document.getElementById('smooth-amount') as HTMLInputElement;
  const smoothVal = document.getElementById('smooth-val')!;
  const smoothBtn = document.getElementById('btn-smooth') as HTMLButtonElement;

  smoothSlider.addEventListener('input', () => {
    smoothVal.textContent = smoothSlider.value;
  });

  smoothBtn.addEventListener('click', () => {
    applySmoothing(parseFloat(smoothSlider.value));
  });
}

function applySmoothing(amount: number): void {
  const svgString = getCurrentSVG();
  if (!svgString) return;

  log.info('Applying smoothing, amount:', amount);

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');

  // In HQ mode, show the vector layer and smooth it, hide pixel layer
  const vectorLayer = doc.getElementById('vector-layer');
  const pixelLayer = doc.getElementById('pixel-layer');
  if (vectorLayer && pixelLayer) {
    log.info('HQ mode: switching to vector layer for smoothing');
    vectorLayer.setAttribute('style', '');
    pixelLayer.setAttribute('style', 'display:none');
  }

  const paths = doc.querySelectorAll('path');

  let smoothed = 0;
  paths.forEach(path => {
    const d = path.getAttribute('d');
    if (d) {
      const newD = smoothCompoundPath(d, amount);
      if (newD !== d) {
        path.setAttribute('d', newD);
        smoothed++;
      }
    }
  });

  const svg = doc.querySelector('svg');
  if (svg) {
    renderSVG(svg.outerHTML);
    log.info(`Smoothed ${smoothed} paths`);
    setStatus(`Smoothed ${smoothed} paths (amount: ${amount})`);
  }
}

interface Point { x: number; y: number; }

interface Segment {
  kind: 'C' | 'L';
  // absolute coords of end anchor
  x: number; y: number;
  // control points (only meaningful for kind === 'C')
  cp1x: number; cp1y: number;
  cp2x: number; cp2y: number;
}

/**
 * Process a compound path (multiple M...Z subpaths).
 */
function smoothCompoundPath(d: string, amount: number): string {
  if (amount === 0) return d;

  // iterations: 1 at amount=0.1, up to 8 at amount=2
  const iterations = Math.max(1, Math.round(amount * 4));

  const subpathStrings = d.split(/(?=[Mm])/).map(s => s.trim()).filter(Boolean);

  return subpathStrings.map(sub => smoothSubpath(sub, iterations)).join(' ');
}

/**
 * Smooth a single subpath.
 *
 * 1. Parse into a start anchor + list of segments (each segment knows its
 *    end anchor and — for cubic beziers — both control points).
 * 2. Collect all anchor positions into an array and apply Laplacian smoothing.
 * 3. For each segment, compute how much its start and end anchors moved, then
 *    translate the control points by those same deltas.
 * 4. Serialise back to a path string with the same command types.
 */
function smoothSubpath(subpath: string, iterations: number): string {
  const commands = parseCommands(subpath);
  if (commands.length < 2) return subpath;

  let cx = 0, cy = 0, startX = 0, startY = 0;
  let isClosed = false;
  const segments: Segment[] = [];

  for (const { type, values } of commands) {
    switch (type) {
      case 'M':
        cx = values[0]; cy = values[1];
        startX = cx; startY = cy;
        for (let i = 2; i < values.length; i += 2) {
          segments.push({ kind: 'L', x: values[i], y: values[i + 1], cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0 });
          cx = values[i]; cy = values[i + 1];
        }
        break;
      case 'm':
        cx += values[0]; cy += values[1];
        startX = cx; startY = cy;
        for (let i = 2; i < values.length; i += 2) {
          cx += values[i]; cy += values[i + 1];
          segments.push({ kind: 'L', x: cx, y: cy, cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0 });
        }
        break;
      case 'L':
        for (let i = 0; i < values.length; i += 2) {
          segments.push({ kind: 'L', x: values[i], y: values[i + 1], cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0 });
          cx = values[i]; cy = values[i + 1];
        }
        break;
      case 'l':
        for (let i = 0; i < values.length; i += 2) {
          cx += values[i]; cy += values[i + 1];
          segments.push({ kind: 'L', x: cx, y: cy, cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0 });
        }
        break;
      case 'H': cx = values[0]; segments.push({ kind: 'L', x: cx, y: cy, cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0 }); break;
      case 'h': cx += values[0]; segments.push({ kind: 'L', x: cx, y: cy, cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0 }); break;
      case 'V': cy = values[0]; segments.push({ kind: 'L', x: cx, y: cy, cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0 }); break;
      case 'v': cy += values[0]; segments.push({ kind: 'L', x: cx, y: cy, cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0 }); break;
      case 'C':
        for (let i = 0; i < values.length; i += 6) {
          segments.push({
            kind: 'C',
            cp1x: values[i],     cp1y: values[i + 1],
            cp2x: values[i + 2], cp2y: values[i + 3],
            x:    values[i + 4], y:    values[i + 5],
          });
          cx = values[i + 4]; cy = values[i + 5];
        }
        break;
      case 'c':
        for (let i = 0; i < values.length; i += 6) {
          segments.push({
            kind: 'C',
            cp1x: cx + values[i],     cp1y: cy + values[i + 1],
            cp2x: cx + values[i + 2], cp2y: cy + values[i + 3],
            x:    cx + values[i + 4], y:    cy + values[i + 5],
          });
          cx += values[i + 4]; cy += values[i + 5];
        }
        break;
      case 'S':
        for (let i = 0; i < values.length; i += 4) {
          // Treat as C with cp1 = current point (approximate)
          segments.push({
            kind: 'C',
            cp1x: cx, cp1y: cy,
            cp2x: values[i],     cp2y: values[i + 1],
            x:    values[i + 2], y:    values[i + 3],
          });
          cx = values[i + 2]; cy = values[i + 3];
        }
        break;
      case 's':
        for (let i = 0; i < values.length; i += 4) {
          segments.push({
            kind: 'C',
            cp1x: cx,             cp1y: cy,
            cp2x: cx + values[i], cp2y: cy + values[i + 1],
            x:    cx + values[i + 2], y: cy + values[i + 3],
          });
          cx += values[i + 2]; cy += values[i + 3];
        }
        break;
      case 'Z': case 'z':
        isClosed = true;
        cx = startX; cy = startY;
        break;
      // Q, T, A: just track endpoint, no control-point adjustment
      default:
        if (values.length >= 2) {
          const ex = type === type.toUpperCase() ? values[values.length - 2] : cx + values[values.length - 2];
          const ey = type === type.toUpperCase() ? values[values.length - 1] : cy + values[values.length - 1];
          segments.push({ kind: 'L', x: ex, y: ey, cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0 });
          cx = ex; cy = ey;
        }
        break;
    }
  }

  if (segments.length < 2) return subpath;

  // Build anchor array: index 0 = start point, index i+1 = segments[i] end
  const n = segments.length + 1;
  const anchors: Point[] = Array.from({ length: n }, (_, i) =>
    i === 0 ? { x: startX, y: startY } : { x: segments[i - 1].x, y: segments[i - 1].y }
  );

  // Laplacian smooth anchor positions
  const smoothed = laplacianSmooth(anchors, iterations, isClosed);

  // Serialise: for each segment, shift control points by the same delta
  // as the anchor they are associated with (cp1 → start anchor, cp2 → end anchor)
  const f = (v: number) => v.toFixed(2);
  let out = `M ${f(smoothed[0].x)} ${f(smoothed[0].y)}`;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const dsx = smoothed[i].x     - anchors[i].x;
    const dsy = smoothed[i].y     - anchors[i].y;
    const dex = smoothed[i + 1].x - anchors[i + 1].x;
    const dey = smoothed[i + 1].y - anchors[i + 1].y;

    if (seg.kind === 'C') {
      out += ` C ${f(seg.cp1x + dsx)} ${f(seg.cp1y + dsy)},` +
             ` ${f(seg.cp2x + dex)} ${f(seg.cp2y + dey)},` +
             ` ${f(smoothed[i + 1].x)} ${f(smoothed[i + 1].y)}`;
    } else {
      out += ` L ${f(smoothed[i + 1].x)} ${f(smoothed[i + 1].y)}`;
    }
  }

  if (isClosed) out += ' Z';
  return out;
}

/**
 * Laplacian (weighted-average) smoothing on a point array.
 * Each iteration: p[i] = 0.25*p[i-1] + 0.5*p[i] + 0.25*p[i+1]
 * Open-path endpoints are pinned.
 */
function laplacianSmooth(points: Point[], iterations: number, closed: boolean): Point[] {
  let pts = points.slice();
  const n = pts.length;
  for (let k = 0; k < iterations; k++) {
    pts = pts.map((p, i) => {
      if (!closed && (i === 0 || i === n - 1)) return p;
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];
      return {
        x: 0.25 * prev.x + 0.5 * p.x + 0.25 * next.x,
        y: 0.25 * prev.y + 0.5 * p.y + 0.25 * next.y,
      };
    });
  }
  return pts;
}

interface ParsedCommand { type: string; values: number[]; }

function parseCommands(d: string): ParsedCommand[] {
  const commands: ParsedCommand[] = [];
  const regex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(d)) !== null) {
    const type = match[1];
    const values = match[2].trim()
      .split(/[\s,]+/)
      .filter(s => s.length > 0)
      .map(Number)
      .filter(n => !isNaN(n));
    commands.push({ type, values });
  }
  return commands;
}

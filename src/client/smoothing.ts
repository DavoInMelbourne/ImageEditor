/**
 * SVG path smoothing — reduces noise and simplifies paths
 * while preserving the overall shape. Works on each subpath independently.
 *
 * Uses a point-reduction approach (Ramer-Douglas-Peucker) rather than
 * re-interpolation, so existing cubic beziers aren't destroyed.
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

/**
 * Process a compound path (multiple M...Z subpaths).
 * Applies Laplacian (weighted-average) smoothing to anchor point positions.
 * No points are removed — topology is always preserved.
 */
function smoothCompoundPath(d: string, amount: number): string {
  if (amount === 0) return d;

  // Each iteration nudges every point 25% toward the midpoint of its neighbours.
  // More iterations = smoother result without ever removing points.
  const iterations = Math.max(1, Math.round(amount * 6)); // 1–12

  const subpathStrings = splitSubpathStrings(d);

  return subpathStrings.map(sub => {
    return smoothSubpathLaplacian(sub, iterations);
  }).join(' ');
}

/**
 * Split a path d-string into subpath strings.
 * Each starts with M/m and optionally ends with Z/z.
 */
function splitSubpathStrings(d: string): string[] {
  const result: string[] = [];
  // Split at M commands but keep the M
  const parts = d.split(/(?=[Mm])/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed) result.push(trimmed);
  }
  return result;
}

/**
 * Smooth a single subpath by:
 * 1. Extracting anchor-point coordinates (no bezier control points)
 * 2. Applying Laplacian smoothing (weighted neighbour average, N iterations)
 * 3. Rebuilding as smooth cubic beziers via Catmull-Rom
 *
 * Using only anchor points (not intermediate bezier samples) means the
 * point density reflects the original path topology, so each iteration
 * produces a small, predictable nudge rather than wholesale shape change.
 */
function smoothSubpathLaplacian(subpath: string, iterations: number): string {
  const commands = parseCommands(subpath);
  if (commands.length < 2) return subpath;

  const { endpoints, isClosed } = extractEndpoints(commands);
  if (endpoints.length < 3) return subpath;

  const smoothed = laplacianSmooth(endpoints, iterations, isClosed);
  return buildSmoothCubicPath(smoothed, isClosed);
}

/** Extract absolute anchor-point coordinates from parsed commands. */
function extractEndpoints(commands: ParsedCommand[]): { endpoints: Point[]; isClosed: boolean } {
  const endpoints: Point[] = [];
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;
  let isClosed = false;

  for (const cmd of commands) {
    const { type, values } = cmd;
    switch (type) {
      case 'M':
        cx = values[0]; cy = values[1];
        startX = cx; startY = cy;
        endpoints.push({ x: cx, y: cy });
        for (let i = 2; i < values.length; i += 2) {
          cx = values[i]; cy = values[i + 1];
          endpoints.push({ x: cx, y: cy });
        }
        break;
      case 'm':
        cx += values[0]; cy += values[1];
        startX = cx; startY = cy;
        endpoints.push({ x: cx, y: cy });
        for (let i = 2; i < values.length; i += 2) {
          cx += values[i]; cy += values[i + 1];
          endpoints.push({ x: cx, y: cy });
        }
        break;
      case 'L':
        for (let i = 0; i < values.length; i += 2) {
          cx = values[i]; cy = values[i + 1];
          endpoints.push({ x: cx, y: cy });
        }
        break;
      case 'l':
        for (let i = 0; i < values.length; i += 2) {
          cx += values[i]; cy += values[i + 1];
          endpoints.push({ x: cx, y: cy });
        }
        break;
      case 'H': cx = values[0]; endpoints.push({ x: cx, y: cy }); break;
      case 'h': cx += values[0]; endpoints.push({ x: cx, y: cy }); break;
      case 'V': cy = values[0]; endpoints.push({ x: cx, y: cy }); break;
      case 'v': cy += values[0]; endpoints.push({ x: cx, y: cy }); break;
      case 'C':
        for (let i = 0; i < values.length; i += 6) {
          cx = values[i + 4]; cy = values[i + 5];
          endpoints.push({ x: cx, y: cy });
        }
        break;
      case 'c':
        for (let i = 0; i < values.length; i += 6) {
          cx += values[i + 4]; cy += values[i + 5];
          endpoints.push({ x: cx, y: cy });
        }
        break;
      case 'S':
        for (let i = 0; i < values.length; i += 4) {
          cx = values[i + 2]; cy = values[i + 3];
          endpoints.push({ x: cx, y: cy });
        }
        break;
      case 's':
        for (let i = 0; i < values.length; i += 4) {
          cx += values[i + 2]; cy += values[i + 3];
          endpoints.push({ x: cx, y: cy });
        }
        break;
      case 'Z': case 'z':
        isClosed = true;
        cx = startX; cy = startY;
        break;
      default:
        if (values.length >= 2) {
          if (type === type.toUpperCase()) {
            cx = values[values.length - 2]; cy = values[values.length - 1];
          } else {
            cx += values[values.length - 2]; cy += values[values.length - 1];
          }
          endpoints.push({ x: cx, y: cy });
        }
        break;
    }
  }

  return { endpoints, isClosed };
}

/**
 * Laplacian (weighted-average) smoothing.
 * Each iteration: p[i] = 0.25*p[i-1] + 0.5*p[i] + 0.25*p[i+1]
 * Open-path endpoints are pinned so the path doesn't drift.
 */
function laplacianSmooth(points: Point[], iterations: number, closed: boolean): Point[] {
  let pts = points.slice();
  const n = pts.length;

  for (let k = 0; k < iterations; k++) {
    const next = pts.map((p, i) => {
      if (!closed && (i === 0 || i === n - 1)) return p; // pin open endpoints
      const prev = pts[(i - 1 + n) % n];
      const nxt  = pts[(i + 1) % n];
      return {
        x: 0.25 * prev.x + 0.5 * p.x + 0.25 * nxt.x,
        y: 0.25 * prev.y + 0.5 * p.y + 0.25 * nxt.y,
      };
    });
    pts = next;
  }
  return pts;
}

/**
 * Build a smooth cubic bezier path from simplified points
 * using Catmull-Rom spline interpolation.
 */
function buildSmoothCubicPath(points: Point[], closed: boolean): string {
  const f = (n: number) => n.toFixed(2);

  let d = `M ${f(points[0].x)} ${f(points[0].y)}`;
  const len = points.length;

  if (len === 2) {
    d += ` L ${f(points[1].x)} ${f(points[1].y)}`;
  } else {
    for (let i = 0; i < len - 1; i++) {
      const p0 = points[closed ? (i - 1 + len) % len : Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[closed ? (i + 2) % len : Math.min(len - 1, i + 2)];

      // Catmull-Rom to cubic bezier control points
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${f(cp1x)} ${f(cp1y)}, ${f(cp2x)} ${f(cp2y)}, ${f(p2.x)} ${f(p2.y)}`;
    }
  }

  if (closed) d += ' Z';
  return d;
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

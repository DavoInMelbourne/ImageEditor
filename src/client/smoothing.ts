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
 * Parse into tokens, identify subpath boundaries, simplify each subpath's
 * control points, then reconstruct.
 */
function smoothCompoundPath(d: string, amount: number): string {
  if (amount === 0) return d;

  // Tolerance for point reduction: higher amount = more simplification
  const tolerance = amount * 2;

  // Split into subpath strings at each M/m command
  const subpathStrings = splitSubpathStrings(d);

  return subpathStrings.map(sub => {
    return simplifySubpathString(sub, tolerance);
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
 * Simplify a single subpath string by:
 * 1. Extracting all endpoint coordinates
 * 2. Applying RDP point reduction
 * 3. Rebuilding as smooth cubic beziers
 */
function simplifySubpathString(subpath: string, tolerance: number): string {
  const commands = parseCommands(subpath);
  if (commands.length < 2) return subpath;

  // Extract all endpoints with their absolute positions
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
        // M can have implicit L coords after first pair
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
        // Q, T, A etc — track endpoint
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

  if (endpoints.length < 3) return subpath;

  // Apply Ramer-Douglas-Peucker simplification
  const simplified = rdpSimplify(endpoints, tolerance);

  if (simplified.length < 2) return subpath;

  // Rebuild as smooth cubic bezier path
  return buildSmoothCubicPath(simplified, isClosed);
}

/**
 * Ramer-Douglas-Peucker line simplification.
 * Removes points that are within `tolerance` distance of the line
 * between their neighbours.
 */
function rdpSimplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;

  // Find the point farthest from the line between first and last
  let maxDist = 0;
  let maxIdx = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDist(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), tolerance);
    const right = rdpSimplify(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  } else {
    return [first, last];
  }
}

function perpendicularDist(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const ex = point.x - lineStart.x;
    const ey = point.y - lineStart.y;
    return Math.sqrt(ex * ex + ey * ey);
  }

  const num = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
  return num / Math.sqrt(lenSq);
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

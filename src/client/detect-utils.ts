/**
 * Pure utility functions for component detection — no DOM deps, fully testable.
 */

export interface Region { x1: number; x2: number; }

/**
 * Scan a column-coverage array (1 = has content, 0 = transparent) and return
 * the x-ranges of distinct content runs separated by gaps of ≥ minGapPx columns.
 */
export function findRegionsFromCoverage(
  colHasContent: Uint8Array | number[],
  minGapPx: number
): Region[] {
  const w = colHasContent.length;
  const regions: Region[] = [];
  let start = -1, gapLen = 0;

  for (let x = 0; x <= w; x++) {
    const hasContent = x < w && colHasContent[x] === 1;
    if (hasContent) {
      if (start === -1) start = x;
      gapLen = 0;
    } else {
      if (start !== -1) {
        gapLen++;
        if (gapLen >= minGapPx) {
          regions.push({ x1: start, x2: x - gapLen });
          start = -1; gapLen = 0;
        }
      }
    }
  }
  if (start !== -1) regions.push({ x1: start, x2: w - 1 });
  return regions;
}

/**
 * Given a set of detected regions and a subpath centerX, return the index of
 * the best-matching region (inside it if possible, otherwise nearest edge).
 */
export function assignToRegion(centerX: number, regions: Region[]): number {
  let best = 0, bestDist = Infinity;
  regions.forEach((r, i) => {
    const dist = centerX >= r.x1 && centerX <= r.x2
      ? 0
      : Math.min(Math.abs(centerX - r.x1), Math.abs(centerX - r.x2));
    if (dist < bestDist) { bestDist = dist; best = i; }
  });
  return best;
}

/**
 * Extract on-curve x-coordinates only (not bézier control points).
 * Potrace uses absolute commands (uppercase), so relative variants are rare.
 */
export function approximateXRange(d: string): { minX: number; maxX: number } {
  const xs: number[] = [];
  const cmdRe = /([MmLlCcSsQqTtAaHhVvZz])([^MmLlCcSsQqTtAaHhVvZz]*)/g;
  let match: RegExpExecArray | null;
  while ((match = cmdRe.exec(d)) !== null) {
    const type = match[1];
    const vals = [...match[2].matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)]
      .map(m => parseFloat(m[0]));
    switch (type) {
      case 'M': case 'L': case 'T':
        for (let i = 0; i < vals.length; i += 2) if (!isNaN(vals[i])) xs.push(vals[i]);
        break;
      case 'C':
        // C x1 y1 x2 y2 x y — only endpoint x (index 4 of each 6-tuple)
        for (let i = 4; i < vals.length; i += 6) if (!isNaN(vals[i])) xs.push(vals[i]);
        break;
      case 'S': case 'Q':
        for (let i = 2; i < vals.length; i += 4) if (!isNaN(vals[i])) xs.push(vals[i]);
        break;
      case 'H':
        xs.push(...vals.filter(v => !isNaN(v)));
        break;
    }
  }
  if (xs.length === 0) return { minX: 0, maxX: 0 };
  return { minX: Math.min(...xs), maxX: Math.max(...xs) };
}

/**
 * Split a compound SVG path d-string into individual subpath strings
 * (each starting with M or m).
 */
export function splitSubpaths(d: string): string[] {
  return (d.match(/[Mm][^Mm]*/g) || []).map(s => s.trim()).filter(Boolean);
}

export function getPositionLabels(count: number): string[] {
  if (count === 1) return ['Center'];
  if (count === 2) return ['Left', 'Right'];
  if (count === 3) return ['Left', 'Center', 'Right'];
  if (count === 4) return ['Far Left', 'Center-Left', 'Center-Right', 'Far Right'];
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return 'Far Left';
    if (i === count - 1) return 'Far Right';
    return `Section ${i + 1}`;
  });
}

/**
 * Tests for component detection utilities.
 * Run with: node --test --import=tsx/esm src/test/detect-utils.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  approximateXRange,
  splitSubpaths,
  findRegionsFromCoverage,
  assignToRegion,
  getPositionLabels,
} from '../client/detect-utils.js';

// ---------------------------------------------------------------------------
// approximateXRange
// ---------------------------------------------------------------------------
describe('approximateXRange', () => {
  test('extracts M endpoint x, skips C control points', () => {
    // M 100 50 C 110 40 120 30 130 50 z
    // Control points: x1=110, x2=120 (should be ignored)
    // Endpoints: M→100, C endpoint→130
    const r = approximateXRange('M 100 50 C 110 40 120 30 130 50 z');
    assert.equal(r.minX, 100);
    assert.equal(r.maxX, 130);
  });

  test('handles multiple C commands', () => {
    // M 200 50 C 210 40 220 30 250 50 C 260 40 270 30 300 50 z
    // Endpoints: 200, 250, 300
    const r = approximateXRange('M 200 50 C 210 40 220 30 250 50 C 260 40 270 30 300 50 z');
    assert.equal(r.minX, 200);
    assert.equal(r.maxX, 300);
  });

  test('returns 0,0 for empty string', () => {
    const r = approximateXRange('');
    assert.equal(r.minX, 0);
    assert.equal(r.maxX, 0);
  });

  test('handles H (horizontal line) command', () => {
    const r = approximateXRange('M 50 100 H 400 V 200 H 50 z');
    assert.equal(r.minX, 50);
    assert.equal(r.maxX, 400);
  });

  test('does NOT include bézier control points in range', () => {
    // Control points at x=5000 and x=6000 — far outside the actual curve
    const r = approximateXRange('M 100 50 C 5000 0 6000 0 200 50 z');
    // Should only see 100 (M) and 200 (C endpoint), NOT 5000/6000
    assert.equal(r.minX, 100);
    assert.equal(r.maxX, 200);
  });

  test('typical potrace subpath stays within glyph bounds', () => {
    // Simulated potrace letter subpath — endpoint x values stay within 80–320
    const path = 'M 80 200 C 70 150 90 100 120 100 C 200 100 250 150 280 200 C 300 240 310 280 320 300 z';
    const r = approximateXRange(path);
    // Endpoints: M→80, C→120, C→280, C→320
    assert.equal(r.minX, 80);
    assert.equal(r.maxX, 320);
    // Control points 70, 90, 200, 250, 300, 310 should NOT affect the range
    assert.ok(r.minX >= 70, 'minX should not be pushed lower than 70 by control points');
  });
});

// ---------------------------------------------------------------------------
// splitSubpaths
// ---------------------------------------------------------------------------
describe('splitSubpaths', () => {
  test('splits a compound path at M boundaries', () => {
    const d = 'M 100 50 C 110 40 130 50 z M 800 50 C 810 40 830 50 z';
    const parts = splitSubpaths(d);
    assert.equal(parts.length, 2);
    assert.ok(parts[0].startsWith('M 100'));
    assert.ok(parts[1].startsWith('M 800'));
  });

  test('handles single subpath', () => {
    const d = 'M 100 50 C 110 40 130 50 z';
    assert.equal(splitSubpaths(d).length, 1);
  });

  test('handles 10 subpaths (typical potrace compound path)', () => {
    const subpaths = Array.from({ length: 10 }, (_, i) => `M ${i * 100} 50 C ${i * 100 + 10} 40 ${i * 100 + 20} 50 z`);
    const d = subpaths.join(' ');
    assert.equal(splitSubpaths(d).length, 10);
  });
});

// ---------------------------------------------------------------------------
// findRegionsFromCoverage
// ---------------------------------------------------------------------------
describe('findRegionsFromCoverage', () => {
  // Helper: build a coverage array from content spans
  function makeCoverage(width: number, contentRanges: Array<[number, number]>): number[] {
    const col = new Array(width).fill(0);
    contentRanges.forEach(([a, b]) => { for (let x = a; x <= b; x++) col[x] = 1; });
    return col;
  }

  test('finds three separate regions (We / heart / Beer)', () => {
    // width=1654, content at 106-528, 569-886, 951-1438, 1461-1553
    // (matches actual detection from logs)
    const coverage = makeCoverage(1654, [[106, 528], [569, 886], [951, 1438], [1461, 1553]]);
    const minGap = Math.max(3, Math.floor(1654 * 0.01)); // 16px
    const regions = findRegionsFromCoverage(coverage, minGap);
    assert.equal(regions.length, 4);
    assert.equal(regions[0].x1, 106);
    assert.equal(regions[0].x2, 528);
    assert.equal(regions[2].x1, 951);
    assert.equal(regions[2].x2, 1438);
  });

  test('single content block returns one region', () => {
    const coverage = makeCoverage(200, [[20, 180]]);
    const regions = findRegionsFromCoverage(coverage, 5);
    assert.equal(regions.length, 1);
    assert.equal(regions[0].x1, 20);
    assert.equal(regions[0].x2, 180);
  });

  test('gap smaller than minGapPx merges regions', () => {
    // gap of 3px, minGapPx=5 → should NOT split
    const coverage = makeCoverage(200, [[10, 80], [84, 180]]);
    const regions = findRegionsFromCoverage(coverage, 5);
    assert.equal(regions.length, 1);
  });

  test('gap exactly at minGapPx splits regions', () => {
    // gap of 5px, minGapPx=5 → SHOULD split
    const coverage = makeCoverage(200, [[10, 80], [85, 180]]);
    const regions = findRegionsFromCoverage(coverage, 5);
    assert.equal(regions.length, 2);
  });

  test('fully transparent image returns no regions', () => {
    const coverage = new Array(500).fill(0);
    const regions = findRegionsFromCoverage(coverage, 5);
    assert.equal(regions.length, 0);
  });
});

// ---------------------------------------------------------------------------
// assignToRegion
// ---------------------------------------------------------------------------
describe('assignToRegion', () => {
  const regions = [
    { x1: 106, x2: 528 },   // Far Left (We)
    { x1: 569, x2: 886 },   // Center-Left (heart)
    { x1: 951, x2: 1438 },  // Center-Right (Beer)
    { x1: 1461, x2: 1553 }, // Far Right
  ];

  test('centerX inside a region → assigned to that region', () => {
    assert.equal(assignToRegion(300, regions), 0);   // inside "We"
    assert.equal(assignToRegion(700, regions), 1);   // inside heart
    assert.equal(assignToRegion(1200, regions), 2);  // inside "Beer"
    assert.equal(assignToRegion(1500, regions), 3);  // inside Far Right
  });

  test('centerX in gap → assigned to nearest region', () => {
    // Gap between regions[0] (x2=528) and regions[1] (x1=569): midpoint ≈ 548
    // 548 is 20px from region[0] end, 21px from region[1] start → region[0]
    assert.equal(assignToRegion(548, regions), 0);
    // 549 is 21px from region[0], 20px from region[1] → region[1]
    assert.equal(assignToRegion(549, regions), 1);
  });

  test('works with a single region', () => {
    assert.equal(assignToRegion(500, [{ x1: 100, x2: 800 }]), 0);
    assert.equal(assignToRegion(900, [{ x1: 100, x2: 800 }]), 0); // outside → nearest
  });
});

// ---------------------------------------------------------------------------
// getPositionLabels
// ---------------------------------------------------------------------------
describe('getPositionLabels', () => {
  test('1 region → Center', () => assert.deepEqual(getPositionLabels(1), ['Center']));
  test('2 regions → Left, Right', () => assert.deepEqual(getPositionLabels(2), ['Left', 'Right']));
  test('3 regions → Left, Center, Right', () => assert.deepEqual(getPositionLabels(3), ['Left', 'Center', 'Right']));
  test('4 regions → Far Left … Far Right', () => {
    const labels = getPositionLabels(4);
    assert.equal(labels[0], 'Far Left');
    assert.equal(labels[3], 'Far Right');
  });
  test('5 regions → Far Left, Section 2-4, Far Right', () => {
    const labels = getPositionLabels(5);
    assert.equal(labels[0], 'Far Left');
    assert.equal(labels[4], 'Far Right');
    assert.equal(labels[2], 'Section 3');
  });
});

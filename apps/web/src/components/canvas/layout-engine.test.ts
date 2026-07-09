import { describe, expect, it } from "vitest";
import {
  boxesOverlap,
  clampToBounds,
  findFirstFit,
  fitToViewport,
  placeWithShrink,
  sanitizeLayout,
  type Box,
  type EngineItem,
} from "./layout-engine";

const COLS = 24;

function item(box: Partial<EngineItem>): EngineItem {
  return { x: 0, y: 0, w: 4, h: 4, minW: 2, minH: 2, ...box };
}

function inBounds(box: Box, cols: number, maxRows: number): boolean {
  return box.x >= 0 && box.x + box.w <= cols && box.y >= 0 && (!Number.isFinite(maxRows) || box.y + box.h <= maxRows);
}

function allFiniteInts(box: Box): boolean {
  return [box.x, box.y, box.w, box.h].every((v) => Number.isInteger(v));
}

function overlapCount(items: readonly Box[]): number {
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (boxesOverlap(items[i], items[j])) count++;
    }
  }
  return count;
}

describe("clampToBounds", () => {
  it("returns the same reference for an already-valid item", () => {
    const valid = item({ x: 3, y: 5, w: 8, h: 8 });
    expect(clampToBounds(valid, COLS, 20)).toBe(valid);
    expect(clampToBounds(valid, COLS, Infinity)).toBe(valid);
  });

  it("clamps oversized, negative, and out-of-range values into bounds", () => {
    expect(clampToBounds(item({ x: -5, y: -3, w: 99, h: 50 }), COLS, 20)).toMatchObject({ x: 0, y: 0, w: 24, h: 20 });
    expect(clampToBounds(item({ x: 20, y: 18, w: 8, h: 8 }), COLS, 20)).toMatchObject({ x: 16, y: 12, w: 8, h: 8 });
  });

  it("replaces non-finite values with the smallest valid ones", () => {
    const fixed = clampToBounds(item({ x: NaN, y: Infinity, w: NaN, h: -Infinity, minW: 4, minH: 4 }), COLS, 20);
    expect(fixed).toMatchObject({ x: 0, y: 0, w: 4, h: 4 });
  });

  it("rounds fractional coordinates to integers", () => {
    expect(clampToBounds(item({ x: 1.4, y: 2.6, w: 4.5, h: 3.2 }), COLS, 20)).toMatchObject({ x: 1, y: 3, w: 5, h: 3 });
  });

  it("bumps size up to minSize", () => {
    expect(clampToBounds(item({ w: 1, h: 1, minW: 4, minH: 4 }), COLS, 20)).toMatchObject({ w: 4, h: 4 });
  });

  it("lets height drop below minH when the viewport itself is shorter", () => {
    expect(clampToBounds(item({ h: 14, minH: 6 }), COLS, 4)).toMatchObject({ y: 0, h: 4 });
  });

  it("does not vertically constrain when maxRows is Infinity", () => {
    const tall = item({ y: 400, h: 50 });
    expect(clampToBounds(tall, COLS, Infinity)).toBe(tall);
  });
});

describe("findFirstFit", () => {
  it("finds the top-left-most gap", () => {
    const occupied = [item({ x: 0, y: 0, w: 8, h: 8 })];
    expect(findFirstFit(occupied, { w: 8, h: 8 }, COLS, 20)).toEqual({ x: 8, y: 0 });
  });

  it("returns null when the size cannot fit the grid at all", () => {
    expect(findFirstFit([], { w: 25, h: 4 }, COLS, 20)).toBeNull();
    expect(findFirstFit([], { w: 4, h: 21 }, COLS, 20)).toBeNull();
    expect(findFirstFit([], { w: 0, h: 4 }, COLS, 20)).toBeNull();
  });

  it("returns null when the grid is full", () => {
    const occupied = [item({ x: 0, y: 0, w: 24, h: 20 })];
    expect(findFirstFit(occupied, { w: 4, h: 4 }, COLS, 20)).toBeNull();
  });

  it("always finds a spot when maxRows is Infinity", () => {
    const occupied = [item({ x: 0, y: 0, w: 24, h: 20 })];
    expect(findFirstFit(occupied, { w: 24, h: 4 }, COLS, Infinity)).toEqual({ x: 0, y: 20 });
  });
});

describe("placeWithShrink", () => {
  it("places at full size when there is room", () => {
    expect(placeWithShrink([], { w: 12, h: 14 }, { w: 6, h: 6 }, COLS, 20)).toEqual({ x: 0, y: 0, w: 12, h: 14 });
  });

  it("shrinks the default height to the viewport (12×14 widget on 11 rows)", () => {
    const placed = placeWithShrink([], { w: 12, h: 14 }, { w: 6, h: 6 }, COLS, 11);
    expect(placed).toEqual({ x: 0, y: 0, w: 12, h: 11 });
  });

  it("clamps a wider-than-grid request instead of failing", () => {
    const placed = placeWithShrink([], { w: 99, h: 8 }, { w: 4, h: 4 }, COLS, 20);
    expect(placed).toEqual({ x: 0, y: 0, w: 24, h: 8 });
  });

  it("prefers the least shrinkage, wider over taller on area ties", () => {
    // 20 columns of the top 8 rows are taken; an 8×8 request has a 4-wide,
    // full-height band left. Best fit by area then width: 4 wide, 8 tall.
    const occupied = [item({ x: 0, y: 0, w: 20, h: 8 })];
    const placed = placeWithShrink(occupied, { w: 8, h: 8 }, { w: 4, h: 4 }, COLS, 8);
    expect(placed).toEqual({ x: 20, y: 0, w: 4, h: 8 });
  });

  it("goes below min height when the viewport is shorter than minH", () => {
    const placed = placeWithShrink([], { w: 12, h: 14 }, { w: 6, h: 6 }, COLS, 4);
    expect(placed).toEqual({ x: 0, y: 0, w: 12, h: 4 });
  });

  it("returns null when nothing fits even at minimum size", () => {
    const occupied = [item({ x: 0, y: 0, w: 24, h: 20 })];
    expect(placeWithShrink(occupied, { w: 8, h: 8 }, { w: 4, h: 4 }, COLS, 20)).toBeNull();
  });
});

describe("sanitizeLayout", () => {
  it("returns the same array reference when every item is valid", () => {
    const items = [item({ x: 0, y: 0 }), item({ x: 10, y: 10 })];
    const result = sanitizeLayout(items, COLS, 20);
    expect(result.items).toBe(items);
    expect(result.changed).toBe(false);
  });

  it("never moves items that were already valid", () => {
    const valid = item({ x: 3, y: 5, w: 8, h: 8 });
    const invalid = item({ x: -10, y: 2, w: 8, h: 8 });
    const { items } = sanitizeLayout([valid, invalid], COLS, 20);
    expect(items[0]).toBe(valid);
    expect(inBounds(items[1], COLS, 20)).toBe(true);
    expect(overlapCount(items)).toBe(0);
  });

  it("re-places clamped items that would land on valid neighbors", () => {
    const anchor = item({ x: 0, y: 0, w: 8, h: 8 });
    const pushedIn = item({ x: -5, y: 0, w: 8, h: 8 }); // clamps to x=0, on top of anchor
    const { items } = sanitizeLayout([anchor, pushedIn], COLS, 20);
    expect(items[0]).toBe(anchor);
    expect(overlapCount(items)).toBe(0);
    expect(inBounds(items[1], COLS, 20)).toBe(true);
  });

  it("preserves pre-existing overlap between valid items (never rearranges saved layouts)", () => {
    const a = item({ x: 0, y: 0, w: 8, h: 8 });
    const b = item({ x: 4, y: 4, w: 8, h: 8 });
    const result = sanitizeLayout([a, b], COLS, 20);
    expect(result.items).toBe(result.items);
    expect(result.changed).toBe(false);
  });

  it("keeps a clamped item in bounds with overlap as a last resort when the grid is full", () => {
    const full = item({ x: 0, y: 0, w: 24, h: 20, minW: 24, minH: 20 });
    const extra = item({ x: 0, y: 25, w: 8, h: 8, minW: 4, minH: 4 });
    const { items } = sanitizeLayout([full, extra], COLS, 20);
    expect(items[0]).toBe(full);
    expect(inBounds(items[1], COLS, 20)).toBe(true);
  });
});

describe("fitToViewport", () => {
  it("returns the same array reference when everything is in bounds or maxRows is Infinity", () => {
    const items = [item({ x: 0, y: 0 }), item({ x: 0, y: 100 })];
    expect(fitToViewport(items, COLS, Infinity)).toBe(items);
    const visible = [item({ x: 0, y: 0 }), item({ x: 8, y: 0 })];
    expect(fitToViewport(visible, COLS, 20)).toBe(visible);
  });

  it("pulls a below-the-fold widget up to the closest visible spot", () => {
    const items = [item({ x: 0, y: 0, w: 8, h: 8 }), item({ x: 0, y: 30, w: 8, h: 8 })];
    const fitted = fitToViewport(items, COLS, 20);
    expect(fitted[0]).toBe(items[0]);
    expect(fitted[1]).toMatchObject({ x: 0, y: 12, w: 8, h: 8 });
  });

  it("keeps visible widgets exactly where they are", () => {
    const visible = [item({ x: 4, y: 4, w: 8, h: 8 })];
    const offender = item({ x: 4, y: 40, w: 8, h: 8 });
    const fitted = fitToViewport([...visible, offender], COLS, 20);
    expect(fitted[0]).toBe(visible[0]);
    expect(inBounds(fitted[1], COLS, 20)).toBe(true);
    expect(overlapCount(fitted)).toBe(0);
  });

  it("shrinks an offender when its full size no longer fits anywhere", () => {
    const anchor = item({ x: 0, y: 0, w: 24, h: 14, minW: 4, minH: 4 });
    const offender = item({ x: 0, y: 30, w: 24, h: 14, minW: 6, minH: 6 });
    const fitted = fitToViewport([anchor, offender], COLS, 20);
    expect(fitted[0]).toBe(anchor);
    expect(inBounds(fitted[1], COLS, 20)).toBe(true);
    expect(overlapCount(fitted)).toBe(0);
    expect(fitted[1].h).toBeLessThanOrEqual(6);
  });

  it("overlaps rather than drops when demand exceeds capacity at minimum sizes", () => {
    const a = item({ x: 0, y: 0, w: 24, h: 20, minW: 24, minH: 20 });
    const b = item({ x: 0, y: 30, w: 24, h: 20, minW: 24, minH: 20 });
    const fitted = fitToViewport([a, b], COLS, 20);
    expect(fitted).toHaveLength(2);
    expect(fitted.every((f) => inBounds(f, COLS, 20))).toBe(true);
  });

  it("is idempotent", () => {
    const items = [
      item({ x: 0, y: 0, w: 12, h: 14 }),
      item({ x: 12, y: 0, w: 12, h: 14 }),
      item({ x: 0, y: 30, w: 12, h: 14 }),
    ];
    const once = fitToViewport(items, COLS, 16);
    const twice = fitToViewport(once, COLS, 16);
    expect(twice).toBe(once);
  });
});

// Deterministic PRNG (mulberry32) so failures are reproducible.
function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("property: invariants hold for arbitrary inputs", () => {
  it("sanitizeLayout output is always in bounds, integral, and order-preserving", () => {
    const rand = prng(42);
    for (let run = 0; run < 200; run++) {
      const maxRows = rand() < 0.3 ? Infinity : 1 + Math.floor(rand() * 30);
      const count = 1 + Math.floor(rand() * 8);
      const items = Array.from({ length: count }, () =>
        item({
          x: Math.floor(rand() * 60) - 20,
          y: Math.floor(rand() * 80) - 20,
          w: rand() < 0.1 ? NaN : Math.floor(rand() * 40) - 5,
          h: rand() < 0.1 ? Infinity : Math.floor(rand() * 40) - 5,
          minW: 1 + Math.floor(rand() * 6),
          minH: 1 + Math.floor(rand() * 6),
        }),
      );
      const { items: sanitized } = sanitizeLayout(items, COLS, maxRows);
      expect(sanitized).toHaveLength(count);
      for (const s of sanitized) {
        expect(allFiniteInts(s)).toBe(true);
        expect(inBounds(s, COLS, maxRows)).toBe(true);
      }
      // Idempotent: a second pass changes nothing.
      const again = sanitizeLayout(sanitized, COLS, maxRows);
      expect(again.changed).toBe(false);
      expect(again.items).toBe(sanitized);
    }
  });

  it("fitToViewport output is always in bounds and idempotent", () => {
    const rand = prng(1337);
    for (let run = 0; run < 200; run++) {
      const maxRows = 1 + Math.floor(rand() * 30);
      const count = 1 + Math.floor(rand() * 8);
      // Start from sanitized-at-Infinity items, like real canonical data.
      const { items } = sanitizeLayout(
        Array.from({ length: count }, () =>
          item({
            x: Math.floor(rand() * 30) - 3,
            y: Math.floor(rand() * 60),
            w: 1 + Math.floor(rand() * 26),
            h: 1 + Math.floor(rand() * 26),
            minW: 1 + Math.floor(rand() * 6),
            minH: 1 + Math.floor(rand() * 6),
          }),
        ),
        COLS,
        Infinity,
      );
      const fitted = fitToViewport(items, COLS, maxRows);
      expect(fitted).toHaveLength(count);
      for (const f of fitted) {
        expect(allFiniteInts(f)).toBe(true);
        expect(inBounds(f, COLS, maxRows)).toBe(true);
      }
      expect(fitToViewport(fitted, COLS, maxRows)).toBe(fitted);
    }
  });

  it("placeWithShrink results never collide with existing items and stay in bounds", () => {
    const rand = prng(7);
    for (let run = 0; run < 200; run++) {
      const maxRows = 1 + Math.floor(rand() * 30);
      const occupied: Box[] = [];
      for (let i = 0; i < 6; i++) {
        const placed = placeWithShrink(
          occupied,
          { w: 1 + Math.floor(rand() * 26), h: 1 + Math.floor(rand() * 26) },
          { w: 1 + Math.floor(rand() * 6), h: 1 + Math.floor(rand() * 6) },
          COLS,
          maxRows,
        );
        if (!placed) continue;
        expect(allFiniteInts(placed)).toBe(true);
        expect(inBounds(placed, COLS, maxRows)).toBe(true);
        expect(occupied.some((box) => boxesOverlap(box, placed))).toBe(false);
        occupied.push(placed);
      }
    }
  });
});

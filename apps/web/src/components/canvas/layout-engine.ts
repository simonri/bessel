// Pure grid geometry for the canvas. Everything here is framework-free and
// total: any input produces an in-bounds result or an explicit null — never an
// off-canvas fallback. `maxRows` may be Infinity ("don't constrain vertically"),
// which every function treats as a first-class case.

export type Size = { w: number; h: number };
export type Box = { x: number; y: number; w: number; h: number };
export type EngineItem = Box & { minW: number; minH: number };

const clampNum = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const toInt = (v: number, fallback: number) => (Number.isFinite(v) ? Math.round(v) : fallback);

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function bottomOf(occupied: readonly Box[]): number {
  let max = 0;
  for (const box of occupied) max = Math.max(max, box.y + box.h);
  return max;
}

/**
 * Force a single item in bounds: integer coords, minW/minH ≤ w/h (mins capped
 * to the grid itself), 0 ≤ x ≤ cols−w, 0 ≤ y (≤ maxRows−h when finite).
 * Non-finite fields fall back to the smallest valid value. Returns the same
 * object when nothing changed.
 */
export function clampToBounds<T extends EngineItem>(item: T, cols: number, maxRows: number): T {
  const finite = Number.isFinite(maxRows);
  const minW = clampNum(toInt(item.minW, 1), 1, cols);
  const minH = finite ? clampNum(toInt(item.minH, 1), 1, maxRows) : Math.max(1, toInt(item.minH, 1));
  const w = clampNum(toInt(item.w, minW), minW, cols);
  const h = finite ? clampNum(toInt(item.h, minH), minH, maxRows) : Math.max(minH, toInt(item.h, minH));
  const x = clampNum(toInt(item.x, 0), 0, cols - w);
  const y = finite ? clampNum(toInt(item.y, 0), 0, maxRows - h) : Math.max(0, toInt(item.y, 0));
  if (x === item.x && y === item.y && w === item.w && h === item.h) return item;
  return { ...item, x, y, w, h };
}

/**
 * Scan for the first open spot (left-to-right, then row by row) that fits
 * `size` without touching `occupied`. Returns null when nothing fits — with a
 * finite maxRows there may genuinely be no room; with Infinity there always is.
 */
export function findFirstFit(
  occupied: readonly Box[],
  size: Size,
  cols: number,
  maxRows: number,
): { x: number; y: number } | null {
  const w = Math.round(size.w);
  const h = Math.round(size.h);
  if (w < 1 || h < 1 || w > cols) return null;
  if (Number.isFinite(maxRows) && h > maxRows) return null;
  // With no row cap, y = bottom of the occupied area is always collision-free,
  // so bounding the scan there keeps it finite while guaranteeing a result.
  const yMax = Number.isFinite(maxRows) ? maxRows - h : bottomOf(occupied);
  for (let y = 0; y <= yMax; y++) {
    for (let x = 0; x <= cols - w; x++) {
      const candidate = { x, y, w, h };
      if (!occupied.some((box) => boxesOverlap(box, candidate))) return { x, y };
    }
  }
  return null;
}

/**
 * Place at `size` if possible, otherwise try progressively smaller candidates
 * down to `min` — ordered by descending area, wider first, so the least
 * shrinkage wins and leftover space in a near-full grid (usually a short wide
 * band) is used well. When maxRows is smaller than min.h the floor drops to
 * maxRows so a widget can still open on a tiny viewport. Null means the
 * workspace genuinely has no room even at minimum size.
 */
export function placeWithShrink(
  occupied: readonly Box[],
  size: Size,
  min: Size,
  cols: number,
  maxRows: number,
): Box | null {
  const startW = clampNum(Math.round(size.w), 1, cols);
  const startH = Number.isFinite(maxRows)
    ? clampNum(Math.round(size.h), 1, maxRows)
    : Math.max(1, Math.round(size.h));
  const minW = clampNum(Math.round(min.w), 1, startW);
  const minH = clampNum(Math.round(min.h), 1, startH);

  const candidates: Size[] = [];
  for (let w = minW; w <= startW; w++) {
    for (let h = minH; h <= startH; h++) candidates.push({ w, h });
  }
  candidates.sort((a, b) => b.w * b.h - a.w * a.h || b.w - a.w);

  for (const candidate of candidates) {
    const spot = findFirstFit(occupied, candidate, cols, maxRows);
    if (spot) return { ...spot, ...candidate };
  }
  return null;
}

/**
 * Hygiene pass over a whole layout: clamp every item in bounds, then re-place
 * only the items the clamping actually moved/resized so they don't land on
 * top of untouched neighbors. Items that were already valid never move.
 * Returns the input array itself when nothing changed.
 */
export function sanitizeLayout<T extends EngineItem>(
  items: T[],
  cols: number,
  maxRows: number,
): { items: T[]; changed: boolean } {
  const clamped = items.map((item) => clampToBounds(item, cols, maxRows));
  if (clamped.every((item, i) => item === items[i])) return { items, changed: false };

  const placed: Box[] = clamped.filter((item, i) => item === items[i]);
  const result = [...clamped];
  for (let i = 0; i < result.length; i++) {
    if (clamped[i] === items[i]) continue;
    let box = result[i];
    if (placed.some((other) => boxesOverlap(other, box))) {
      const spot = findFirstFit(placed, box, cols, maxRows);
      if (spot) {
        box = { ...box, ...spot };
      } else {
        const shrunk = placeWithShrink(placed, box, { w: box.minW, h: box.minH }, cols, maxRows);
        // No room anywhere: keep the clamped position — in-bounds with overlap
        // beats off-canvas, and the user can drag things apart.
        if (shrunk) box = { ...box, ...shrunk };
      }
    }
    result[i] = box;
    placed.push(box);
  }
  return { items: result, changed: true };
}

function fitOne<T extends EngineItem>(item: T, placed: readonly Box[], cols: number, maxRows: number): T {
  const anchored = clampToBounds(item, cols, maxRows);
  if (!placed.some((other) => boxesOverlap(other, anchored))) return anchored;
  const spot = findFirstFit(placed, anchored, cols, maxRows);
  if (spot) return { ...anchored, ...spot };
  const shrunk = placeWithShrink(placed, anchored, { w: item.minW, h: item.minH }, cols, maxRows);
  if (shrunk) return { ...anchored, ...shrunk };
  return anchored;
}

/**
 * Display-time fit for a viewport that may be smaller than the layout was
 * arranged on. In-bounds items are left untouched (same references — callers
 * rely on identity to know nothing moved); out-of-bounds items are pulled back
 * into view near their own position, re-placed, or shrunk, in that order.
 * Never drops an item: when demand exceeds capacity even at minimum sizes the
 * last resort is a deterministic in-bounds overlap. Idempotent, and the
 * identity fast path returns the input array itself.
 */
export function fitToViewport<T extends EngineItem>(items: T[], cols: number, maxRows: number): T[] {
  if (!Number.isFinite(maxRows)) return items;
  const inBounds = (box: Box) =>
    box.x >= 0 && box.x + box.w <= cols && box.y >= 0 && box.y + box.h <= maxRows;
  if (items.every(inBounds)) return items;

  const offenders = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !inBounds(item))
    .sort((a, b) => a.item.y - b.item.y || a.item.x - b.item.x || a.index - b.index);

  const placed: Box[] = items.filter(inBounds);
  const result = [...items];
  for (const { item, index } of offenders) {
    const fitted = fitOne(item, placed, cols, maxRows);
    result[index] = fitted;
    placed.push(fitted);
  }
  return result;
}

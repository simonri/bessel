import { describe, expect, it } from "vitest";
import {
  axisUsdFormatter,
  formatAmount,
  formatPercent,
  formatPrice,
  formatSignedUsd,
  formatUsd,
  formatVolume,
  liquidationDistance,
  pnlHeadline,
  pnlTone,
  timeTicks,
  valueAxis,
} from "./-hyperliquid-format";

describe("hyperliquid formatting", () => {
  it("formats money", () => {
    expect(formatUsd(36641.8716)).toBe("$36,641.87");
    expect(formatSignedUsd(1201.666)).toBe("+$1,201.67");
    expect(formatSignedUsd(-40)).toBe("-$40.00");
    expect(formatSignedUsd(0)).toBe("$0.00");
    expect(formatVolume(21279385.25)).toBe("$21.3M");
    expect(formatVolume(7483.93)).toBe("$7,483.93");
    expect(axisUsdFormatter([0, 10000])(36500)).toBe("$36.5K");
    expect(axisUsdFormatter([0, 10000])(0)).toBe("$0");
    expect(axisUsdFormatter([14950, 15000])(15000)).toBe("$15,000");
  });

  it("puts the value axis on round steps", () => {
    expect(valueAxis([0, 38300]).ticks).toEqual([
      0, 10000, 20000, 30000, 40000,
    ]);
    // Always includes zero, so gains and losses read against it.
    expect(valueAxis([120, 1201]).ticks).toEqual([0, 500, 1000, 1500]);
    expect(valueAxis([-120, 300]).ticks).toEqual([-200, 0, 200, 400]);
    expect(valueAxis([-950, -40]).domain).toEqual([-1000, 0]);
    // A flat line still gets a span, with distinct labels.
    const flat = valueAxis([0, 0]);
    expect(flat.domain[1]).toBeGreaterThan(flat.domain[0]);
    expect(new Set(flat.ticks.map(axisUsdFormatter(flat.ticks))).size).toBe(
      flat.ticks.length,
    );
  });

  it("keeps the precision a price needs", () => {
    expect(formatPrice(85076.2)).toBe("85,076.2");
    expect(formatPrice(89.0725)).toBe("89.073");
    expect(formatPrice(0.00012345)).toBe("0.000123");
  });

  it("formats amounts and percentages", () => {
    expect(formatAmount(0.00519304)).toBe("0.00519304");
    expect(formatAmount(15000)).toBe("15,000");
    expect(formatPercent(0.0339)).toBe("+3.39%");
    expect(formatPercent(-0.5)).toBe("-50.00%");
  });

  it("tones PnL by sign", () => {
    expect(pnlTone(5)).toContain("emerald");
    expect(pnlTone(-5)).toContain("rose");
    expect(pnlTone(0)).toBe("text-white/90");
    expect(pnlTone(null)).toBe("text-white/90");
  });

  it("places axis ticks on distinct calendar boundaries", () => {
    const start = new Date(2026, 8, 26, 14, 10).getTime();
    const week = timeTicks(start, new Date(2026, 9, 3, 9).getTime(), "week");
    expect(week.map((t) => new Date(t).getDate())).toEqual([
      27, 28, 29, 30, 1, 2, 3,
    ]);
    expect(week.every((t) => new Date(t).getHours() === 0)).toBe(true);

    const day = timeTicks(start, start + 12 * 3_600_000, "day");
    expect(day.map((t) => new Date(t).getHours())).toEqual([15, 18, 21, 0]);

    const all = timeTicks(
      new Date(2024, 0, 24).getTime(),
      new Date(2026, 9, 3).getTime(),
      "allTime",
    );
    expect(all.length).toBeLessThanOrEqual(9);
    expect(new Set(all.map((t) => new Date(t).getDate()))).toEqual(
      new Set([1]),
    );
  });

  it("sums up the range in one friendly line", () => {
    expect(pnlHeadline(1714.54, "month")).toBe(
      "You're up $1,714.54 over the last 30 days ✨",
    );
    expect(pnlHeadline(-40, "day")).toBe("You're down $40.00 in the last 24h");
    expect(pnlHeadline(0, "week")).toBe("Flat over the last 7 days");
    expect(pnlHeadline(null, "allTime")).toBe("Catching up with Hyperliquid…");
  });

  it("measures how far the mark is from liquidation", () => {
    expect(liquidationDistance(100, 80)).toBeCloseTo(0.2);
    expect(liquidationDistance(100, 120)).toBeCloseTo(0.2);
    expect(liquidationDistance(100, null)).toBeNull();
    expect(liquidationDistance(undefined, 80)).toBeNull();
  });
});

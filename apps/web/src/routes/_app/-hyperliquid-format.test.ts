import { describe, expect, it } from "vitest";
import {
  axisUsdFormatter,
  formatAmount,
  formatPercent,
  formatPrice,
  formatSignedUsd,
  formatUsd,
  formatVolume,
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
    expect(valueAxis([35117, 36825]).ticks).toEqual([
      35000, 35500, 36000, 36500, 37000,
    ]);
    expect(valueAxis([0, 38300]).ticks).toEqual([
      0, 10000, 20000, 30000, 40000,
    ]);
    // A flat balance still gets a span.
    const flat = valueAxis([15000.01, 15000.01]);
    expect(flat.domain[0]).toBeLessThan(15000.01);
    expect(flat.domain[1]).toBeGreaterThan(15000.01);
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
    expect(pnlTone(-5)).toContain("red");
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
});

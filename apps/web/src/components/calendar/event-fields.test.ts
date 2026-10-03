import { describe, expect, it } from "vitest";
import {
  endTimeOptions,
  fmtDuration,
  monthGrid,
  startTimeOptions,
} from "./event-fields";

describe("startTimeOptions", () => {
  it("lists every 15 minutes of the day", () => {
    const options = startTimeOptions(new Date(2026, 9, 6, 12));
    expect(options).toHaveLength(96);
    expect(options[0].value).toEqual(new Date(2026, 9, 6, 0));
    expect(options[95].value).toEqual(new Date(2026, 9, 6, 23, 45));
  });

  it("keeps an off-grid current time, in order", () => {
    const current = new Date(2026, 9, 6, 12, 10);
    const options = startTimeOptions(current);
    expect(options).toHaveLength(97);
    const i = options.findIndex((o) => o.value.getTime() === current.getTime());
    expect(options[i - 1].value).toEqual(new Date(2026, 9, 6, 12));
    expect(options[i + 1].value).toEqual(new Date(2026, 9, 6, 12, 15));
  });
});

describe("endTimeOptions", () => {
  const start = new Date(2026, 9, 6, 12);

  it("runs from 15 minutes to a day after the start, with lengths", () => {
    const options = endTimeOptions(start, new Date(2026, 9, 6, 13));
    expect(options).toHaveLength(96);
    expect(options[0]).toEqual({
      value: new Date(2026, 9, 6, 12, 15),
      hint: "15m",
    });
    expect(options[3].hint).toBe("1h");
    expect(options.at(-1)).toEqual({
      value: new Date(2026, 9, 7, 12),
      hint: "24h",
    });
  });

  it("keeps a current end beyond a day", () => {
    const far = new Date(2026, 9, 8, 9);
    const options = endTimeOptions(start, far);
    expect(options.at(-1)).toEqual({ value: far, hint: "45h" });
  });
});

describe("fmtDuration", () => {
  it("reads like Notion", () => {
    expect(fmtDuration(30 * 60_000)).toBe("30m");
    expect(fmtDuration(60 * 60_000)).toBe("1h");
    expect(fmtDuration(90 * 60_000)).toBe("1h 30m");
  });
});

describe("monthGrid", () => {
  it("is six weeks from the Monday on or before the 1st", () => {
    const grid = monthGrid(new Date(2026, 9, 15));
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual(new Date(2026, 8, 28));
    expect(grid[0].getDay()).toBe(1);
  });
});

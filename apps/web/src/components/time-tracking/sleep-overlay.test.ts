import { describe, expect, it } from "vitest";
import { sleepBands } from "./sleep-overlay";

const seg = (start: number, end: number, label = "asleepCore") => ({
  start_ts: start,
  end_ts: end,
  label,
});

describe("sleepBands", () => {
  it("joins stages across short wake-ups and counts only time asleep", () => {
    const bands = sleepBands([
      seg(1000, 2000),
      seg(2000, 2600, "awake"),
      seg(2600, 4000, "asleepDeep"),
    ]);
    expect(bands).toEqual([{ start: 1000, end: 4000, asleepSecs: 2400 }]);
  });

  it("keeps sleeps apart when awake for longer than half an hour", () => {
    const bands = sleepBands([seg(0, 3600), seg(3600 + 31 * 60, 9000)]);
    expect(bands.map((b) => [b.start, b.end])).toEqual([
      [0, 3600],
      [3600 + 31 * 60, 9000],
    ]);
  });

  it("ignores lanes with only awake time", () => {
    expect(sleepBands([seg(0, 600, "awake")])).toEqual([]);
  });
});

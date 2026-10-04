import { describe, expect, it } from "vitest";
import { localDayBounds } from "./-activity-utils";

const at = (ts: number) => new Date(ts * 1000);

describe("localDayBounds", () => {
  it("runs midnight to midnight by default", () => {
    const [start, end] = localDayBounds(new Date(2026, 9, 4, 15));
    expect(at(start)).toEqual(new Date(2026, 9, 4));
    expect(at(end)).toEqual(new Date(2026, 9, 5));
  });

  it("can start the day later", () => {
    const [start, end] = localDayBounds(new Date(2026, 9, 4, 15), 6);
    expect(at(start)).toEqual(new Date(2026, 9, 4, 6));
    expect(at(end)).toEqual(new Date(2026, 9, 5, 6));
  });
});

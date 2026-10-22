import { describe, expect, it } from "vitest";
import { changeThisMonth, pointsInRange, valueOn } from "./net-worth-card";

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const points = [
  { day: day("2025-01-10"), value: 100 },
  { day: day("2026-06-15"), value: 300 },
  { day: day("2026-09-30"), value: 400 },
  { day: day("2026-10-05"), value: 450 },
  { day: day("2026-10-22"), value: 470 },
];
const today = day("2026-10-22");

describe("valueOn", () => {
  it("is the last change on or before the day", () => {
    expect(valueOn(points, day("2026-10-04"))).toBe(400);
    expect(valueOn(points, day("2026-10-05"))).toBe(450);
    expect(valueOn(points, day("2024-12-31"))).toBeNull();
  });
});

describe("pointsInRange", () => {
  it("starts three months back with the value net worth had then", () => {
    const shown = pointsInRange(points, "3m", today);
    expect(
      shown.map((p) => [new Date(p.time).toDateString(), p.value]),
    ).toEqual([
      [day("2026-07-22").toDateString(), 300],
      [day("2026-09-30").toDateString(), 400],
      [day("2026-10-05").toDateString(), 450],
      [day("2026-10-22").toDateString(), 470],
    ]);
  });

  it("shows everything for all", () => {
    expect(pointsInRange(points, "all", today)).toHaveLength(points.length);
  });
});

describe("changeThisMonth", () => {
  it("compares with the end of last month", () => {
    expect(changeThisMonth(points, today)).toBe(70);
  });

  it("is unknown without history from before the month", () => {
    expect(changeThisMonth(points.slice(3), today)).toBeNull();
  });
});

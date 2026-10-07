// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiDate,
  localIsoDay,
  msUntilNextLocalDay,
  useApiToday,
  useLocalDay,
} from "./local-day";

afterEach(() => {
  vi.useRealTimers();
});

describe("apiDate", () => {
  it("serializes to exactly UTC midnight of the day, as `date` params need", () => {
    expect(apiDate("2026-10-07").toISOString()).toBe(
      "2026-10-07T00:00:00.000Z",
    );
  });
});

describe("localIsoDay", () => {
  it("uses the local calendar day, not the UTC one", () => {
    const lateEvening = new Date(2026, 9, 7, 23, 30);
    expect(localIsoDay(lateEvening)).toBe("2026-10-07");
    const justAfterMidnight = new Date(2026, 9, 8, 0, 5);
    expect(localIsoDay(justAfterMidnight)).toBe("2026-10-08");
  });
});

describe("msUntilNextLocalDay", () => {
  it("counts to the next local midnight", () => {
    expect(msUntilNextLocalDay(new Date(2026, 9, 7, 23, 0))).toBe(3_600_000);
  });
});

describe("useLocalDay", () => {
  it("rolls over at local midnight while mounted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 23, 59, 0));
    const { result } = renderHook(() => useLocalDay());
    expect(result.current).toBe("2026-10-07");

    act(() => vi.advanceTimersByTime(2 * 60_000));
    expect(result.current).toBe("2026-10-08");
  });

  it("catches a rollover missed while asleep when the page shows again", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 12, 0));
    const { result } = renderHook(() => useLocalDay());

    // The clock jumps without timers firing, as after a suspend.
    vi.setSystemTime(new Date(2026, 9, 9, 8, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe("2026-10-09");
  });
});

describe("useApiToday", () => {
  it("keeps the same Date until the day changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 9, 0));
    const { result, rerender } = renderHook(() => useApiToday());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(first.toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });
});

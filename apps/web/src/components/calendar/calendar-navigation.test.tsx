// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCalendarNavigation } from "./calendar-page";

beforeEach(() => window.localStorage.clear());

describe("useCalendarNavigation", () => {
  it("starts on the week view", () => {
    const { result } = renderHook(() => useCalendarNavigation("UTC"));
    expect(result.current.view).toBe("week");
  });

  it("remembers the last picked view", () => {
    const first = renderHook(() => useCalendarNavigation("UTC"));
    act(() => first.result.current.setView("centered"));
    first.unmount();

    const { result } = renderHook(() => useCalendarNavigation("UTC"));
    expect(result.current.view).toBe("centered");
  });

  it("ignores an unknown stored view", () => {
    window.localStorage.setItem("bessel:calendar-view", "month");
    const { result } = renderHook(() => useCalendarNavigation("UTC"));
    expect(result.current.view).toBe("week");
  });

  describe("with a later day start", () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it("opens on the day before until the start hour, on the night the clocks fall back", () => {
      vi.stubEnv("TZ", "Europe/Stockholm");
      vi.useFakeTimers({ toFake: ["Date"] });
      // 02:30 UTC is 03:30 in Stockholm, after the clocks went back an hour.
      vi.setSystemTime(new Date("2026-10-25T02:30:00Z"));
      const { result } = renderHook(() =>
        useCalendarNavigation("Europe/Stockholm", "bessel:test-view", 4),
      );
      expect(result.current.date).toEqual(new Date(2026, 9, 24));
    });
  });
});

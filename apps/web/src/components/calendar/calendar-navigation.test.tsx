// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
});

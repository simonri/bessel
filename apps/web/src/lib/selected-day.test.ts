// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  setSelectedDay,
  setSelectedSource,
  useSelectedDay,
  useSelectedSource,
} from "./selected-day";

afterEach(() => {
  setSelectedDay(null);
  setSelectedSource(null);
});

describe("selected day", () => {
  it("starts on today and the default machine", () => {
    expect(renderHook(() => useSelectedDay()).result.current).toBeNull();
    expect(renderHook(() => useSelectedSource()).result.current).toBeNull();
  });

  it("is shared: every page reading it moves when one sets it", () => {
    const timeline = renderHook(() => [useSelectedDay(), useSelectedSource()]);
    const screenTime = renderHook(() => [
      useSelectedDay(),
      useSelectedSource(),
    ]);

    act(() => setSelectedDay("2026-09-15"));
    act(() => setSelectedSource("laptop"));

    expect(timeline.result.current).toEqual(["2026-09-15", "laptop"]);
    expect(screenTime.result.current).toEqual(["2026-09-15", "laptop"]);
  });

  it("changes the day without touching the machine, and back", () => {
    act(() => setSelectedSource("laptop"));
    act(() => setSelectedDay("2026-09-15"));
    const { result } = renderHook(() => [
      useSelectedDay(),
      useSelectedSource(),
    ]);

    act(() => setSelectedDay(null));

    expect(result.current).toEqual([null, "laptop"]);
  });
});

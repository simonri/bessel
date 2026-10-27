// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { userStorage } from "@/lib/user-storage";
import { PROJECT_FILTER_KEY, useProjectFilter } from "./-use-project-filter";

beforeEach(() => userStorage.removeItem(PROJECT_FILTER_KEY));

describe("useProjectFilter", () => {
  it("starts on every project", () => {
    const { result } = renderHook(() => useProjectFilter());
    expect(result.current[0]).toBeNull();
  });

  it("keeps the picked project when the page comes back", () => {
    const first = renderHook(() => useProjectFilter());
    act(() => first.result.current[1]("Holiday"));
    expect(first.result.current[0]).toBe("Holiday");
    first.unmount();

    const { result } = renderHook(() => useProjectFilter());
    expect(result.current[0]).toBe("Holiday");
  });

  it("forgets it once every project is picked again", () => {
    const first = renderHook(() => useProjectFilter());
    act(() => first.result.current[1]("Holiday"));
    act(() => first.result.current[1](null));
    first.unmount();

    const { result } = renderHook(() => useProjectFilter());
    expect(result.current[0]).toBeNull();
  });
});

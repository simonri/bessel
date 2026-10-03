// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCollapsedAccounts } from "./calendar-sidebar";

afterEach(() => localStorage.clear());

describe("useCollapsedAccounts", () => {
  it("toggles accounts and remembers them across visits", () => {
    const first = renderHook(() => useCollapsedAccounts());
    act(() => first.result.current[1]("a"));
    act(() => first.result.current[1]("b"));
    act(() => first.result.current[1]("a"));
    expect([...first.result.current[0]]).toEqual(["b"]);

    const later = renderHook(() => useCollapsedAccounts());
    expect([...later.result.current[0]]).toEqual(["b"]);
  });

  it("ignores unreadable stored state", () => {
    localStorage.setItem("bessel:calendar-collapsed-accounts", "{nope");
    const { result } = renderHook(() => useCollapsedAccounts());
    expect(result.current[0].size).toBe(0);
  });
});

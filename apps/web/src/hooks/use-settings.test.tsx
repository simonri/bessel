// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsProvider, useSettings } from "./use-settings";

// This environment's global `localStorage` is a broken Node stub (no clear/removeItem),
// not jsdom's Storage implementation — replace it with a real in-memory one for these tests.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(),
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() { return data.size; },
  };
}

Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });

function setup() {
  return renderHook(() => useSettings(), { wrapper: SettingsProvider });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("migration from the pre-rebrand key name", () => {
  it("falls back to metron:settings when bessel:settings is absent", () => {
    window.localStorage.setItem(
      "metron:settings",
      JSON.stringify({ theme: "green" }),
    );

    const { result } = setup();

    expect(result.current.settings.theme).toBe("green");
  });

  it("prefers bessel:settings when both keys are present", () => {
    window.localStorage.setItem(
      "metron:settings",
      JSON.stringify({ theme: "green" }),
    );
    window.localStorage.setItem(
      "bessel:settings",
      JSON.stringify({ theme: "orange" }),
    );

    const { result } = setup();

    expect(result.current.settings.theme).toBe("orange");
  });

  it("update() persists under the current key going forward", () => {
    window.localStorage.setItem(
      "metron:settings",
      JSON.stringify({ theme: "green" }),
    );

    const { result } = setup();
    act(() => result.current.update({ theme: "orange" }));

    const raw = window.localStorage.getItem("bessel:settings");
    expect(JSON.parse(raw!).theme).toBe("orange");
  });
});

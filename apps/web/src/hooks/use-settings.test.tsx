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
    setItem: (key, value) => {
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
}

Object.defineProperty(window, "localStorage", {
  value: memoryStorage(),
  configurable: true,
});

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
      JSON.stringify({ cryptoPairs: "ETHUSDT" }),
    );

    const { result } = setup();

    expect(result.current.settings.cryptoPairs).toBe("ETHUSDT");
  });

  it("prefers bessel:settings when both keys are present", () => {
    window.localStorage.setItem(
      "metron:settings",
      JSON.stringify({ cryptoPairs: "ETHUSDT" }),
    );
    window.localStorage.setItem(
      "bessel:settings",
      JSON.stringify({ cryptoPairs: "SOLUSDT" }),
    );

    const { result } = setup();

    expect(result.current.settings.cryptoPairs).toBe("SOLUSDT");
  });

  it("update() persists under the current key going forward", () => {
    window.localStorage.setItem(
      "metron:settings",
      JSON.stringify({ cryptoPairs: "ETHUSDT" }),
    );

    const { result } = setup();
    act(() => result.current.update({ cryptoPairs: "SOLUSDT" }));

    const raw = window.localStorage.getItem("bessel:settings");
    expect(JSON.parse(raw!).cryptoPairs).toBe("SOLUSDT");
  });
});

describe("the one look", () => {
  it("is the peach accent on stone, whatever was saved before", () => {
    window.localStorage.setItem(
      "bessel:settings",
      JSON.stringify({
        theme: "sky",
        wallpaper: "image",
        cryptoPairs: "ETHUSDT",
      }),
    );

    const { result } = setup();

    expect(result.current.settings.theme).toBe("orange");
    expect(result.current.settings.wallpaper).toBe("stone");
    expect(result.current.settings.cryptoPairs).toBe("ETHUSDT");
    expect(document.documentElement.dataset.theme).toBe("orange");
  });

  it("is what a new user gets", () => {
    const { result } = setup();

    expect(result.current.settings.theme).toBe("orange");
    expect(result.current.settings.wallpaper).toBe("stone");
  });

  it("can't be changed by an update", () => {
    const { result } = setup();

    act(() => result.current.update({ theme: "lilac", wallpaper: "zinc" }));

    expect(result.current.settings.theme).toBe("orange");
    expect(result.current.settings.wallpaper).toBe("stone");
  });
});

describe("crypto pairs", () => {
  it("are empty for a new user", () => {
    const { result } = setup();

    expect(result.current.settings.cryptoPairs).toBe("");
  });

  it("stay empty once a new user's settings are saved", () => {
    const first = setup();
    act(() => first.result.current.update({ navOrder: ["tasks"] }));
    first.unmount();

    const { result } = setup();

    expect(result.current.settings.navOrder).toEqual(["tasks"]);
    expect(result.current.settings.cryptoPairs).toBe("");
  });

  it("keep the old BTCUSDT default for settings saved before it changed", () => {
    window.localStorage.setItem(
      "bessel:settings",
      JSON.stringify({ gridGap: 8 }),
    );

    const { result } = setup();

    expect(result.current.settings.cryptoPairs).toBe("BTCUSDT");
  });

  it("keep a list someone cleared", () => {
    window.localStorage.setItem(
      "bessel:settings",
      JSON.stringify({ cryptoPairs: "" }),
    );

    const { result } = setup();

    expect(result.current.settings.cryptoPairs).toBe("");
  });
});

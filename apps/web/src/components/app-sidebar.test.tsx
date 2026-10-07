// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadSidebarWidth } from "./app-sidebar";

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

beforeEach(() => window.localStorage.clear());

describe("loadSidebarWidth", () => {
  it("uses the default width when nothing is stored", () => {
    expect(loadSidebarWidth()).toBe(208);
  });

  it("restores and clamps a stored width", () => {
    window.localStorage.setItem("bessel:sidebarWidth", "300");
    expect(loadSidebarWidth()).toBe(300);
    window.localStorage.setItem("bessel:sidebarWidth", "10");
    expect(loadSidebarWidth()).toBe(180);
  });

  it("ignores garbage", () => {
    window.localStorage.setItem("bessel:sidebarWidth", "wide");
    expect(loadSidebarWidth()).toBe(208);
  });
});

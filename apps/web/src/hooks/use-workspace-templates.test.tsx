// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  useWorkspaceTemplates,
  WorkspaceTemplatesProvider,
} from "./use-workspace-templates";

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
  return renderHook(() => useWorkspaceTemplates(), {
    wrapper: WorkspaceTemplatesProvider,
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("migration from the pre-rebrand key name", () => {
  it("falls back to metron:workspace-templates when bessel:workspace-templates is absent", () => {
    window.localStorage.setItem(
      "metron:workspace-templates",
      JSON.stringify([{ id: "t1", name: "Dev", widgets: [] }]),
    );

    const { result } = setup();

    expect(result.current.templates).toEqual([
      { id: "t1", name: "Dev", widgets: [] },
    ]);
  });

  it("prefers bessel:workspace-templates when both keys are present", () => {
    window.localStorage.setItem(
      "metron:workspace-templates",
      JSON.stringify([{ id: "old", name: "Old", widgets: [] }]),
    );
    window.localStorage.setItem(
      "bessel:workspace-templates",
      JSON.stringify([{ id: "new", name: "New", widgets: [] }]),
    );

    const { result } = setup();

    expect(result.current.templates).toEqual([
      { id: "new", name: "New", widgets: [] },
    ]);
  });

  it("upsertTemplate persists under the current key going forward", () => {
    window.localStorage.setItem(
      "metron:workspace-templates",
      JSON.stringify([{ id: "t1", name: "Dev", widgets: [] }]),
    );

    const { result } = setup();
    act(() =>
      result.current.upsertTemplate({ id: "t2", name: "New", widgets: [] }),
    );

    const raw = window.localStorage.getItem("bessel:workspace-templates");
    expect(JSON.parse(raw!)).toEqual([
      { id: "t1", name: "Dev", widgets: [] },
      { id: "t2", name: "New", widgets: [] },
    ]);
  });
});

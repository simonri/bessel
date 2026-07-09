// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { WindowManager, useWindowManager } from "./window-manager";

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
  return renderHook(() => useWindowManager(), { wrapper: WindowManager });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("moveWindowToWorkspace", () => {
  it("moves a window to another workspace, keeping its id and losing no data", () => {
    const { result } = setup();

    act(() => result.current.openWindow("tasks", { foo: "bar" }));
    const original = result.current.windows[0];
    expect(original).toBeTruthy();

    act(() => result.current.addWorkspace());
    const targetWorkspaceId = result.current.activeWorkspaceId;
    act(() => result.current.switchWorkspace(
      result.current.workspaces.find((ws) => ws.id !== targetWorkspaceId)!.id,
    ));
    const sourceWorkspaceId = result.current.activeWorkspaceId;

    act(() => result.current.moveWindowToWorkspace(original.id, targetWorkspaceId));

    // Gone from the source workspace's active list.
    expect(result.current.windows.some((w) => w.id === original.id)).toBe(false);

    // Still present exactly once in the flat list, same id and data, new workspace.
    const moved = result.current.allWindows.find((w) => w.id === original.id);
    expect(moved).toBeTruthy();
    expect(moved!.id).toBe(original.id);
    expect(moved!.module).toBe("tasks");
    expect(moved!.data).toEqual({ foo: "bar" });
    expect(moved!.workspaceId).toBe(targetWorkspaceId);
    expect(result.current.allWindows.filter((w) => w.id === original.id)).toHaveLength(1);

    // Switching to the target workspace surfaces it as active.
    act(() => result.current.switchWorkspace(targetWorkspaceId));
    expect(result.current.windows.some((w) => w.id === original.id)).toBe(true);

    // Switching back to the source workspace confirms it's really gone from there.
    act(() => result.current.switchWorkspace(sourceWorkspaceId));
    expect(result.current.windows.some((w) => w.id === original.id)).toBe(false);
  });

  it("is a no-op when the target workspace no longer exists", () => {
    const { result } = setup();
    act(() => result.current.openWindow("tasks"));
    const original = result.current.allWindows[0];

    act(() => result.current.moveWindowToWorkspace(original.id, "does-not-exist"));

    expect(result.current.allWindows.find((w) => w.id === original.id)?.workspaceId).toBe(
      original.workspaceId,
    );
  });

  it("removing a workspace only drops that workspace's windows", () => {
    const { result } = setup();
    act(() => result.current.openWindow("tasks"));
    const keep = result.current.allWindows[0];
    const sourceWorkspaceId = result.current.activeWorkspaceId;

    act(() => result.current.addWorkspace());
    const doomedWorkspaceId = result.current.activeWorkspaceId;
    act(() => result.current.openWindow("accounts"));

    act(() => result.current.removeWorkspace(doomedWorkspaceId));

    expect(result.current.workspaces.some((ws) => ws.id === doomedWorkspaceId)).toBe(false);
    expect(result.current.allWindows.some((w) => w.workspaceId === doomedWorkspaceId)).toBe(false);
    expect(result.current.allWindows.find((w) => w.id === keep.id)?.workspaceId).toBe(
      sourceWorkspaceId,
    );
  });
});

describe("applyTemplate", () => {
  it("opens all specified widgets into a new workspace and switches to it", () => {
    const { result } = setup();
    const originalWorkspaceId = result.current.activeWorkspaceId;

    act(() =>
      result.current.applyTemplate(
        [
          { module: "terminal", data: { commands: JSON.stringify(["echo one"]) } },
          { module: "terminal" },
          { module: "claudeCode" },
        ],
        "new",
      ),
    );

    expect(result.current.workspaces).toHaveLength(2);
    expect(result.current.activeWorkspaceId).not.toBe(originalWorkspaceId);
    expect(result.current.windows).toHaveLength(3);
    expect(result.current.windows.map((w) => w.module)).toEqual(["terminal", "terminal", "claudeCode"]);
    // Slots don't collide within the new workspace.
    expect(new Set(result.current.windows.map((w) => w.slot)).size).toBe(3);
    expect(result.current.windows[0].data).toEqual({ commands: JSON.stringify(["echo one"]) });

    // The original workspace is untouched.
    act(() => result.current.switchWorkspace(originalWorkspaceId));
    expect(result.current.windows).toHaveLength(0);
  });

  it("appends to the current workspace without clobbering existing windows or slots", () => {
    const { result } = setup();
    act(() => result.current.openWindow("tasks"));
    const existing = result.current.windows[0];

    act(() => result.current.applyTemplate([{ module: "terminal" }, { module: "terminal" }], "current"));

    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.windows).toHaveLength(3);
    expect(result.current.windows.find((w) => w.id === existing.id)?.slot).toBe(existing.slot);
    expect(new Set(result.current.windows.map((w) => w.slot)).size).toBe(3);
  });
});

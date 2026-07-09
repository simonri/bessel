// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { WindowManager, useWindowManager, type WindowEntry } from "./window-manager";

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

function overlaps(a: WindowEntry, b: WindowEntry): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function hasNoOverlaps(windows: WindowEntry[]): boolean {
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      if (overlaps(windows[i], windows[j])) return false;
    }
  }
  return true;
}

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
    // Size is preserved across the move, only position is re-placed.
    expect(moved!.w).toBe(original.w);
    expect(moved!.h).toBe(original.h);
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
    // Widgets don't overlap within the new workspace.
    expect(hasNoOverlaps(result.current.windows)).toBe(true);
    expect(result.current.windows[0].data).toEqual({ commands: JSON.stringify(["echo one"]) });

    // The original workspace is untouched.
    act(() => result.current.switchWorkspace(originalWorkspaceId));
    expect(result.current.windows).toHaveLength(0);
  });

  it("appends to the current workspace without clobbering existing windows or their position", () => {
    const { result } = setup();
    act(() => result.current.openWindow("tasks"));
    const existing = result.current.windows[0];

    act(() => result.current.applyTemplate([{ module: "terminal" }, { module: "terminal" }], "current"));

    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.windows).toHaveLength(3);
    const stillThere = result.current.windows.find((w) => w.id === existing.id);
    expect(stillThere).toMatchObject({ x: existing.x, y: existing.y, w: existing.w, h: existing.h });
    expect(hasNoOverlaps(result.current.windows)).toBe(true);
  });
});

describe("alignWorkspace", () => {
  it("compacts gaps without changing sizes, and is idempotent", () => {
    const { result } = setup();
    act(() => result.current.openWindow("tasks"));
    act(() => result.current.openWindow("accounts"));
    const [first, second] = result.current.windows;
    const workspaceId = result.current.activeWorkspaceId;

    // Push the second widget down, leaving a gap above it.
    act(() =>
      result.current.updateLayout(workspaceId, [
        { i: first.id, x: first.x, y: first.y, w: first.w, h: first.h },
        { i: second.id, x: second.x, y: second.y + 20, w: second.w, h: second.h },
      ]),
    );
    expect(result.current.windows.find((w) => w.id === second.id)?.y).toBe(second.y + 20);

    act(() => result.current.alignWorkspace());
    const aligned = result.current.windows;
    expect(hasNoOverlaps(aligned)).toBe(true);
    expect(aligned.find((w) => w.id === second.id)!.y).toBeLessThan(second.y + 20);
    expect(aligned.find((w) => w.id === first.id)).toMatchObject({ w: first.w, h: first.h });
    expect(aligned.find((w) => w.id === second.id)).toMatchObject({ w: second.w, h: second.h });

    const positionsAfterFirstAlign = aligned.map((w) => ({ id: w.id, x: w.x, y: w.y }));
    act(() => result.current.alignWorkspace());
    const positionsAfterSecondAlign = result.current.windows;
    for (const p of positionsAfterFirstAlign) {
      const win = positionsAfterSecondAlign.find((w) => w.id === p.id)!;
      expect(win.x).toBe(p.x);
      expect(win.y).toBe(p.y);
    }
  });
});

describe("viewport-aware placement", () => {
  it("shrinks a widget's default size to fit a short viewport", () => {
    const { result } = setup();
    act(() => result.current.setViewportRows(11));

    let opened = false;
    act(() => { opened = result.current.openWindow("gitStatus"); });

    expect(opened).toBe(true);
    const win = result.current.windows[0];
    // Default is 12×14; only the height needs to give.
    expect(win).toMatchObject({ w: 12, h: 11 });
    expect(win.y + win.h).toBeLessThanOrEqual(11);
  });

  it("rejects adding a widget when the workspace is full, without adding anything", () => {
    const { result } = setup();
    act(() => result.current.setViewportRows(11));

    // Three 8×8 widgets fill the top; the 3-row band left can't take a 4×4 minimum.
    act(() => result.current.toggleWindow("tasks"));
    act(() => result.current.toggleWindow("accounts"));
    act(() => result.current.toggleWindow("transactions"));
    expect(result.current.windows).toHaveLength(3);

    let opened = true;
    act(() => { opened = result.current.toggleWindow("dashboard"); });

    expect(opened).toBe(false);
    expect(result.current.windows).toHaveLength(3);
    expect(result.current.isOpen("dashboard")).toBe(false);
  });

  it("applies a template partially when only some widgets fit, and reports it", () => {
    const { result } = setup();
    act(() => result.current.setViewportRows(11));

    let outcome = { opened: 0, skipped: 0 };
    act(() => {
      outcome = result.current.applyTemplate(
        [{ module: "terminal" }, { module: "terminal" }, { module: "terminal" }],
        "new",
      );
    });

    expect(outcome).toEqual({ opened: 2, skipped: 1 });
    expect(result.current.windows).toHaveLength(2);
    expect(hasNoOverlaps(result.current.windows)).toBe(true);
    for (const win of result.current.windows) {
      expect(win.x).toBeGreaterThanOrEqual(0);
      expect(win.x + win.w).toBeLessThanOrEqual(24);
      expect(win.y).toBeGreaterThanOrEqual(0);
      expect(win.y + win.h).toBeLessThanOrEqual(11);
    }
  });

  it("refuses to move a window into a workspace that has no room for it", () => {
    const { result } = setup();
    act(() => result.current.setViewportRows(11));

    act(() => result.current.openWindow("tasks"));
    const moving = result.current.windows[0];
    const sourceWorkspaceId = result.current.activeWorkspaceId;

    act(() => result.current.addWorkspace());
    const targetWorkspaceId = result.current.activeWorkspaceId;
    act(() => result.current.toggleWindow("tasks"));
    act(() => result.current.toggleWindow("accounts"));
    act(() => result.current.toggleWindow("transactions"));

    let moved = true;
    act(() => { moved = result.current.moveWindowToWorkspace(moving.id, targetWorkspaceId); });

    expect(moved).toBe(false);
    expect(result.current.allWindows.find((w) => w.id === moving.id)?.workspaceId).toBe(
      sourceWorkspaceId,
    );
  });
});

describe("layout sanitization", () => {
  it("clamps garbage stored data into bounds on load", () => {
    window.localStorage.setItem(
      "metron:workspaces",
      JSON.stringify({
        workspaces: [
          {
            id: "ws-1",
            windows: [
              { module: "tasks", x: 0, y: 0, w: 8, h: 8 },
              { module: "accounts", x: -5, y: -3, w: 99, h: 8 },
              { module: "transactions", x: 3, y: 1000000, w: 8, h: 8 },
            ],
          },
        ],
        activeWorkspaceId: "ws-1",
      }),
    );

    const { result } = setup();

    expect(result.current.windows).toHaveLength(3);
    for (const win of result.current.windows) {
      expect(Number.isInteger(win.x) && Number.isInteger(win.y)).toBe(true);
      expect(win.x).toBeGreaterThanOrEqual(0);
      expect(win.x + win.w).toBeLessThanOrEqual(24);
      expect(win.y).toBeGreaterThanOrEqual(0);
      expect(win.y + win.h).toBeLessThanOrEqual(500);
    }
    expect(hasNoOverlaps(result.current.windows)).toBe(true);
    // The valid window was not touched by the cleanup.
    expect(result.current.windows.find((w) => w.module === "tasks")).toMatchObject({
      x: 0, y: 0, w: 8, h: 8,
    });
  });

  it("pulls windows pushed below the fold back into view on updateLayout", () => {
    const { result } = setup();
    act(() => result.current.setViewportRows(11));
    act(() => result.current.openWindow("tasks"));
    const win = result.current.windows[0];
    const workspaceId = result.current.activeWorkspaceId;

    act(() =>
      result.current.updateLayout(workspaceId, [{ i: win.id, x: 0, y: 30, w: 8, h: 8 }]),
    );

    const updated = result.current.windows[0];
    expect(updated.y + updated.h).toBeLessThanOrEqual(11);
  });
});

describe("alignWorkspace with a viewport cap", () => {
  it("keeps everything within the viewport after aligning", () => {
    const { result } = setup();
    act(() => result.current.openWindow("tasks"));
    act(() => result.current.openWindow("accounts"));
    const second = result.current.windows[1];
    const workspaceId = result.current.activeWorkspaceId;

    // Park the second widget far below the fold while unconstrained.
    act(() =>
      result.current.updateLayout(workspaceId, [
        { i: second.id, x: second.x, y: 40, w: second.w, h: second.h },
      ]),
    );
    act(() => result.current.setViewportRows(11));

    act(() => result.current.alignWorkspace());

    expect(result.current.windows).toHaveLength(2);
    expect(hasNoOverlaps(result.current.windows)).toBe(true);
    for (const win of result.current.windows) {
      expect(win.y).toBeGreaterThanOrEqual(0);
      expect(win.y + win.h).toBeLessThanOrEqual(11);
      expect(win.x).toBeGreaterThanOrEqual(0);
      expect(win.x + win.w).toBeLessThanOrEqual(24);
    }
  });
});

describe("migration from the legacy slot-based layout", () => {
  it("converts slot data into non-overlapping, in-bounds x/y/w/h", () => {
    window.localStorage.setItem(
      "metron:workspaces",
      JSON.stringify({
        workspaces: [
          {
            id: "ws-1",
            windows: [
              { module: "tasks", slot: 0 },
              { module: "accounts", slot: 1 },
              { module: "transactions", slot: 2 },
            ],
          },
        ],
        activeWorkspaceId: "ws-1",
      }),
    );

    const { result } = setup();

    expect(result.current.windows).toHaveLength(3);
    for (const win of result.current.windows) {
      expect(win.x).toBeGreaterThanOrEqual(0);
      expect(win.x + win.w).toBeLessThanOrEqual(24);
      expect(win.y).toBeGreaterThanOrEqual(0);
    }
    expect(hasNoOverlaps(result.current.windows)).toBe(true);
  });

  it("leaves already-migrated (x/y/w/h) data untouched", () => {
    window.localStorage.setItem(
      "metron:workspaces",
      JSON.stringify({
        workspaces: [
          { id: "ws-1", windows: [{ module: "tasks", x: 3, y: 5, w: 8, h: 8 }] },
        ],
        activeWorkspaceId: "ws-1",
      }),
    );

    const { result } = setup();

    expect(result.current.windows[0]).toMatchObject({ x: 3, y: 5, w: 8, h: 8 });
  });
});

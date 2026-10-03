// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasDock } from "./canvas-dock";
import { CanvasEmptyState } from "./canvas-empty-state";
import { useWindowManager, WindowManager } from "./window-manager";

// Hoisted: desktop-only modules (Claude, Terminal) are decided at import time.
vi.hoisted(() => {
  Object.defineProperty(window, "electron", { value: {}, configurable: true });
});

const PROJECTS = [
  { id: "p1", name: "metron", path: "/home/me/metron", ssh_host: null },
  { id: "p2", name: "notes", path: "/home/me/notes", ssh_host: null },
];

vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ data: PROJECTS, isSuccess: true }),
}));

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

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function mount(projectId?: string) {
  window.localStorage.setItem(
    "bessel:workspaces",
    JSON.stringify({
      workspaces: [
        { id: "w", ...(projectId ? { projectId } : {}), windows: [] },
      ],
      activeWorkspaceId: "w",
    }),
  );
  let captured: ReturnType<typeof useWindowManager> | undefined;
  function Capture() {
    captured = useWindowManager();
    return null;
  }
  render(
    <WindowManager>
      <Capture />
      <CanvasEmptyState />
      <CanvasDock />
    </WindowManager>,
  );
  return () => captured!;
}

const card = () =>
  within(screen.getByRole("region", { name: "Empty session" }));

describe("empty session", () => {
  it("offers to start something in the session's project", () => {
    const manager = mount("p1");
    expect(screen.getByText("Start something in metron")).toBeTruthy();

    fireEvent.click(card().getByRole("button", { name: "Claude" }));

    expect(manager().allWindows).toMatchObject([
      {
        module: "claudeCode",
        data: { projectPath: "/home/me/metron", projectName: "metron" },
      },
    ]);
    expect(screen.queryByText("Start something in metron")).toBeNull();
  });

  it("opens widgets without a project", () => {
    const manager = mount();
    expect(screen.getByText("This session is empty")).toBeTruthy();
    act(() => {
      fireEvent.click(card().getByRole("button", { name: "Tasks" }));
    });
    expect(manager().allWindows.map((w) => w.module)).toEqual(["tasks"]);
  });
});

describe("dock in a project's session", () => {
  it("opens agents straight in the project", () => {
    const manager = mount("p1");
    fireEvent.click(screen.getByTitle(/^Terminal in metron/));
    expect(manager().allWindows).toMatchObject([
      { module: "terminal", data: { projectPath: "/home/me/metron" } },
    ]);
    expect(screen.queryByText("Select project")).toBeNull();
  });

  it("still lets you pick another project with a right-click", () => {
    const manager = mount("p1");
    fireEvent.contextMenu(screen.getByTitle(/^Claude in metron/));
    fireEvent.click(screen.getByText("notes"));
    expect(manager().allWindows).toMatchObject([
      { module: "claudeCode", data: { projectPath: "/home/me/notes" } },
    ]);
  });

  it("asks for a project when the session has none", () => {
    const manager = mount();
    fireEvent.click(screen.getByTitle("Claude"));
    expect(screen.getByText("Select project")).toBeTruthy();
    expect(manager().allWindows).toHaveLength(0);
  });
});

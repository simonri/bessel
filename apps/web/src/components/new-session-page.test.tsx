// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWindowManager, WindowManager } from "@/components/canvas/window-manager";
import { NewSessionPage } from "./new-session-page";

const PROJECTS = [
  { id: "p1", name: "metron", path: "/home/me/metron", ssh_host: null },
  { id: "p2", name: "remote", path: "/srv/remote", ssh_host: "me@box" },
];

vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ data: PROJECTS, isSuccess: true }),
}));
vi.mock("@/lib/environment", () => ({ isDesktop: true }));

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

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function mount(projectId: string | null) {
  let captured: ReturnType<typeof useWindowManager> | undefined;
  function Capture() {
    captured = useWindowManager();
    captured.setViewportRows(20);
    return null;
  }
  const onCancel = vi.fn();
  const onCreated = vi.fn();
  render(
    <WindowManager>
      <Capture />
      <NewSessionPage projectId={projectId} onCancel={onCancel} onCreated={onCreated} />
    </WindowManager>,
  );
  return { manager: () => captured!, onCancel, onCreated };
}

describe("NewSessionPage", () => {
  it("preselects the project and opens N agents tiled evenly into a new session", () => {
    const { manager, onCreated } = mount("p2");
    expect((screen.getByRole("radio", { name: /^remote/ }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByLabelText("Codex"));
    fireEvent.click(screen.getByLabelText("3"));
    fireEvent.change(screen.getByLabelText("Session name"), { target: { value: "Trio" } });
    fireEvent.click(screen.getByRole("button", { name: /Open 3 × Codex in remote/ }));

    expect(onCreated).toHaveBeenCalledTimes(1);
    const { workspaces, activeWorkspaceId, windows } = manager();
    expect(workspaces).toHaveLength(2);
    expect(workspaces.find((ws) => ws.id === activeWorkspaceId)).toEqual({
      id: activeWorkspaceId,
      name: "Trio",
      projectId: "p2",
    });
    expect(windows.map((w) => w.module)).toEqual(["codex", "codex", "codex"]);
    expect(windows.map((w) => [w.x, w.y, w.w, w.h])).toEqual([
      [0, 0, 8, 20],
      [8, 0, 8, 20],
      [16, 0, 8, 20],
    ]);
    for (const w of windows) {
      expect(w.data).toEqual({
        projectPath: "/srv/remote",
        projectName: "remote",
        projectSshHost: "me@box",
      });
    }
    // Per-window data objects are independent — a widget saving its own
    // state must not bleed into its siblings.
    expect(windows[0].data).not.toBe(windows[1].data);
  });

  it("can start without a project, and Escape cancels", () => {
    const { manager, onCancel } = mount(null);
    expect((screen.getByRole("radio", { name: /^No project/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Open Claude$/ }));
    const { windows, workspaces, activeWorkspaceId } = manager();
    expect(windows.map((w) => w.module)).toEqual(["claudeCode"]);
    expect(windows[0]).toMatchObject({ x: 0, y: 0, w: 24, h: 20, data: undefined });
    expect(workspaces.find((ws) => ws.id === activeWorkspaceId)?.projectId).toBeUndefined();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

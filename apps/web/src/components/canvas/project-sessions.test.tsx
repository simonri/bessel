// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTemplatesProvider } from "@/hooks/use-workspace-templates";
import { setWindowAgentStatus } from "./canvas-agent-status";
import { ProjectSessions } from "./project-sessions";
import { useWindowManager, WindowManager } from "./window-manager";

const PROJECTS = [
  { id: "p1", name: "metron", path: "/home/me/metron", ssh_host: null },
  { id: "p2", name: "remote", path: "/srv/remote", ssh_host: "me@box" },
  { id: "p3", name: "elsewhere", path: null, ssh_host: null },
];

vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ data: PROJECTS, isSuccess: true }),
}));

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

function seed(workspaces: unknown[], activeWorkspaceId: string) {
  window.localStorage.setItem(
    "bessel:workspaces",
    JSON.stringify({ workspaces, activeWorkspaceId }),
  );
}

function mount(props: Partial<Parameters<typeof ProjectSessions>[0]> = {}) {
  let captured: ReturnType<typeof useWindowManager> | undefined;
  function Capture() {
    captured = useWindowManager();
    return null;
  }
  const onOpenCanvas = vi.fn();
  const onNewSession = vi.fn();
  render(
    <WindowManager>
      <WorkspaceTemplatesProvider>
        <Capture />
        <ProjectSessions
          isOnCanvasPage
          onOpenCanvas={onOpenCanvas}
          onNewSession={onNewSession}
          {...props}
        />
      </WorkspaceTemplatesProvider>
    </WindowManager>,
  );
  return { manager: () => captured!, onOpenCanvas, onNewSession };
}

describe("ProjectSessions", () => {
  it("nests sessions under their project and files the rest under Other", () => {
    seed(
      [
        { id: "a", projectId: "p1", name: "Refactor", windows: [{ module: "tasks", x: 0, y: 0, w: 4, h: 4 }, { module: "tasks", x: 4, y: 0, w: 4, h: 4 }] },
        { id: "b", projectId: "gone", windows: [] },
        { id: "c", windows: [] },
      ],
      "a",
    );
    mount();

    for (const p of PROJECTS) expect(screen.getByText(p.name)).toBeTruthy();
    expect(screen.getByText("Refactor")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    // Two unassigned sessions with nothing open both read as the default label.
    expect(screen.getAllByText("Session")).toHaveLength(2);
    // The project's badge sums windows across its sessions; the session's own
    // badge shows its count.
    expect(screen.getAllByText("2")).toHaveLength(2);
  });

  it("derives a label from what's open and rolls agent status up to the session dot", () => {
    seed(
      [{ id: "a", projectId: "p1", windows: [
        { module: "tasks", x: 0, y: 0, w: 4, h: 4 },
        { module: "tasks", x: 4, y: 0, w: 4, h: 4 },
        { module: "gitStatus", x: 8, y: 0, w: 6, h: 6 },
      ] }],
      "a",
    );
    const { manager } = mount();
    expect(screen.getByText("Tasks ×2 · Git")).toBeTruthy();

    const [first, second] = manager().allWindows;
    const dot = () => screen.getByTitle("Tasks ×2 · Git").querySelector("span[aria-hidden]")!;
    expect(dot().className).toContain("bg-white/20");
    act(() => setWindowAgentStatus(first.id, "free"));
    expect(dot().className).toContain("bg-emerald-400");
    act(() => setWindowAgentStatus(second.id, "working"));
    expect(dot().className).toContain("bg-amber-400");
    act(() => {
      setWindowAgentStatus(first.id, null);
      setWindowAgentStatus(second.id, null);
    });
    expect(dot().className).toContain("bg-white/20");
  });

  it("shows a widget-count badge for one or more widgets, but not zero", () => {
    seed(
      [
        {
          id: "one",
          name: "One widget",
          windows: [{ module: "tasks", x: 0, y: 0, w: 4, h: 4 }],
        },
        { id: "empty", name: "Empty", windows: [] },
      ],
      "one",
    );
    mount();

    expect(
      screen.getByTitle("One widget").querySelector('[title="1 widget"]'),
    ).toBeTruthy();
    expect(screen.getByTitle("Empty").querySelector('[title$="widget"]')).toBeNull();
  });

  it("switches to a clicked session and brings the canvas on screen", () => {
    seed([{ id: "a", projectId: "p1", windows: [] }, { id: "b", projectId: "p1", name: "Two", windows: [] }], "a");
    const { manager, onOpenCanvas } = mount({ isOnCanvasPage: false });
    fireEvent.click(screen.getByText("Two"));
    expect(manager().activeWorkspaceId).toBe("b");
    expect(onOpenCanvas).toHaveBeenCalledTimes(1);
  });

  it("offers a New session button per configured project, none for unconfigured ones", () => {
    seed([{ id: "a", windows: [] }], "a");
    const { onNewSession } = mount();
    fireEvent.click(screen.getByLabelText("New session in metron"));
    expect(onNewSession).toHaveBeenLastCalledWith("p1");
    expect(screen.queryByLabelText("New session in elsewhere")).toBeNull();
    fireEvent.click(screen.getByLabelText("New session in Other"));
    expect(onNewSession).toHaveBeenLastCalledWith(null);
  });

  it("collapses a project, remembering it across remounts", () => {
    seed([{ id: "a", projectId: "p1", name: "Hidden me", windows: [] }], "a");
    const first = mount();
    fireEvent.click(screen.getByText("metron"));
    expect(screen.queryByText("Hidden me")).toBeNull();
    cleanup();
    void first;
    mount();
    expect(screen.queryByText("Hidden me")).toBeNull();
    fireEvent.click(screen.getByText("metron"));
    expect(screen.getByText("Hidden me")).toBeTruthy();
  });

  it("adopts legacy sessions whose widgets all point at one known project", () => {
    seed(
      [
        { id: "legacy", windows: [
          { module: "gitStatus", x: 0, y: 0, w: 6, h: 6, data: { projectPath: "/srv/remote", projectSshHost: "me@box" } },
          { module: "tasks", x: 6, y: 0, w: 4, h: 4 },
        ] },
        { id: "mixed", windows: [
          { module: "gitStatus", x: 0, y: 0, w: 6, h: 6, data: { projectPath: "/srv/remote", projectSshHost: "me@box" } },
          { module: "gitStatus", x: 6, y: 0, w: 6, h: 6, data: { projectPath: "/home/me/metron" } },
        ] },
        { id: "unknown", windows: [
          { module: "gitStatus", x: 0, y: 0, w: 6, h: 6, data: { projectPath: "/nowhere" } },
        ] },
      ],
      "legacy",
    );
    const { manager } = mount();
    const byId = Object.fromEntries(manager().workspaces.map((ws) => [ws.id, ws.projectId]));
    expect(byId).toEqual({ legacy: "p2", mixed: undefined, unknown: undefined });
  });
});

// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ClaudeSessionsSnapshot,
  ClaudeSessionView,
} from "@/components/claude-sessions/claude-sessions-types";
import { WorkspaceTemplatesProvider } from "@/hooks/use-workspace-templates";
import { setWindowAgentStatus } from "./canvas-agent-status";
import { ProjectSessions } from "./project-sessions";
import { useWindowManager, WindowManager } from "./window-manager";

const PROJECTS = [
  { id: "p1", name: "metron", path: "/home/me/metron", ssh_host: null },
  { id: "p2", name: "remote", path: "/srv/remote", ssh_host: "me@box" },
  { id: "p3", name: "elsewhere", path: null, ssh_host: null },
];

const projectsMock = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ data: projectsMock.list, isSuccess: true }),
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

// Hoisted: the window manager decides at import time whether desktop-only
// widgets (Claude) exist.
const claude = vi.hoisted(() => {
  const state = {
    push: (_snapshot: ClaudeSessionsSnapshot) => {},
    api: {
      snapshot: vi.fn(() => new Promise<ClaudeSessionsSnapshot>(() => {})),
      onChanged: vi.fn((cb: (snapshot: ClaudeSessionsSnapshot) => void) => {
        state.push = cb;
        return () => {};
      }),
      end: vi.fn(() => Promise.resolve()),
      remoteUrl: vi.fn(() => Promise.resolve(null)),
    },
  };
  Object.defineProperty(window, "electron", {
    value: { claudeSessions: state.api },
    configurable: true,
  });
  return state;
});
const pushSnapshot = (snapshot: ClaudeSessionsSnapshot) =>
  claude.push(snapshot);
const claudeSessions = claude.api;

function claudeSession(
  overrides: Partial<ClaudeSessionView>,
): ClaudeSessionView {
  return {
    key: "s1",
    bgId: "ba084a19",
    sessionId: "ba084a19-eef6-423d-9301-441ec9e0eb9f",
    name: "Fix calendar",
    cwd: "/home/me/metron",
    projectId: null,
    createdAt: 1,
    endedAt: null,
    status: "working",
    remoteUrl: null,
    conversationIds: [],
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  projectsMock.list = PROJECTS;
  window.localStorage.clear();
  act(() => pushSnapshot({ sessions: [], external: [], available: true }));
});

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
    <QueryClientProvider client={new QueryClient()}>
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
      </WindowManager>
    </QueryClientProvider>,
  );
  return { manager: () => captured!, onOpenCanvas, onNewSession };
}

describe("ProjectSessions", () => {
  it("nests sessions under their project and files the rest under No project", () => {
    seed(
      [
        {
          id: "a",
          projectId: "p1",
          name: "Refactor",
          windows: [
            { module: "tasks", x: 0, y: 0, w: 4, h: 4 },
            { module: "tasks", x: 4, y: 0, w: 4, h: 4 },
          ],
        },
        { id: "b", projectId: "gone", name: "Orphaned", windows: [] },
        { id: "c", name: "Scratch", windows: [] },
      ],
      "a",
    );
    mount();

    for (const p of PROJECTS) expect(screen.getByText(p.name)).toBeTruthy();
    expect(screen.getByText("Refactor")).toBeTruthy();
    expect(screen.getByText("No project")).toBeTruthy();
    expect(screen.getByText("Orphaned")).toBeTruthy();
    expect(screen.getByText("Scratch")).toBeTruthy();
    // The project's badge sums windows across its sessions; the session's own
    // badge shows its count.
    expect(screen.getAllByText("2")).toHaveLength(2);
  });

  it("derives a label from what's open and rolls agent status up to the session dot", () => {
    seed(
      [
        {
          id: "a",
          projectId: "p1",
          windows: [
            { module: "tasks", x: 0, y: 0, w: 4, h: 4 },
            { module: "tasks", x: 4, y: 0, w: 4, h: 4 },
            { module: "gitStatus", x: 8, y: 0, w: 6, h: 6 },
          ],
        },
      ],
      "a",
    );
    const { manager } = mount();
    expect(screen.getByText("Tasks ×2 - Git")).toBeTruthy();

    const [first, second] = manager().allWindows;
    const dot = () =>
      screen.getByTitle("Tasks ×2 - Git").querySelector("span[aria-hidden]")!;
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
    expect(
      screen.getByTitle("Empty").querySelector('[title$="widget"]'),
    ).toBeNull();
  });

  it("switches to a clicked session and brings the canvas on screen", () => {
    seed(
      [
        { id: "a", projectId: "p1", windows: [] },
        { id: "b", projectId: "p1", name: "Two", windows: [] },
      ],
      "a",
    );
    const { manager, onOpenCanvas } = mount({ isOnCanvasPage: false });
    fireEvent.click(screen.getByText("Two"));
    expect(manager().activeWorkspaceId).toBe("b");
    expect(onOpenCanvas).toHaveBeenCalledTimes(1);
  });

  it("offers quick start for configured projects and a folder picker for the rest", () => {
    seed([{ id: "a", name: "Loose", windows: [] }], "a");
    const { onNewSession } = mount();

    fireEvent.click(screen.getByLabelText("Start something in metron"));
    expect(screen.getByText("More options…")).toBeTruthy();
    fireEvent.click(screen.getByText("More options…"));
    expect(onNewSession).toHaveBeenLastCalledWith("p1");

    expect(
      screen.getByLabelText("Set elsewhere's folder on this device"),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("New session"));
    expect(onNewSession).toHaveBeenLastCalledWith(null);
  });

  it("invites adding a first project when there are none", () => {
    seed([{ id: "a", windows: [] }], "a");
    mount();
    expect(screen.queryByText("Add your first project")).toBeNull();
    cleanup();

    projectsMock.list = [];
    mount();
    expect(screen.getByText("Add your first project")).toBeTruthy();
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
        {
          id: "legacy",
          windows: [
            {
              module: "gitStatus",
              x: 0,
              y: 0,
              w: 6,
              h: 6,
              data: { projectPath: "/srv/remote", projectSshHost: "me@box" },
            },
            { module: "tasks", x: 6, y: 0, w: 4, h: 4 },
          ],
        },
        {
          id: "mixed",
          windows: [
            {
              module: "gitStatus",
              x: 0,
              y: 0,
              w: 6,
              h: 6,
              data: { projectPath: "/srv/remote", projectSshHost: "me@box" },
            },
            {
              module: "gitStatus",
              x: 6,
              y: 0,
              w: 6,
              h: 6,
              data: { projectPath: "/home/me/metron" },
            },
          ],
        },
        {
          id: "unknown",
          windows: [
            {
              module: "gitStatus",
              x: 0,
              y: 0,
              w: 6,
              h: 6,
              data: { projectPath: "/nowhere" },
            },
          ],
        },
      ],
      "legacy",
    );
    const { manager } = mount();
    const byId = Object.fromEntries(
      manager().workspaces.map((ws) => [ws.id, ws.projectId]),
    );
    expect(byId).toEqual({
      legacy: "p2",
      mixed: undefined,
      unknown: undefined,
    });
  });
  describe("background Claude sessions", () => {
    it("lists running sessions no window shows under their project", () => {
      seed(
        [
          {
            id: "a",
            projectId: "p1",
            name: "Canvas",
            windows: [
              {
                module: "claudeCode",
                x: 0,
                y: 0,
                w: 8,
                h: 8,
                data: { claudeSessionKey: "shown" },
              },
            ],
          },
        ],
        "a",
      );
      mount();
      act(() =>
        pushSnapshot({
          sessions: [
            claudeSession({ key: "bg", name: "Fix calendar" }),
            claudeSession({ key: "shown", name: "Open in a window" }),
            claudeSession({
              key: "done",
              name: "Finished long ago",
              status: "ended",
            }),
            claudeSession({ key: "loose", name: "Scratch", cwd: "/tmp/x" }),
          ],
          external: [],
          available: true,
        }),
      );

      expect(screen.getByText("Fix calendar")).toBeTruthy();
      expect(screen.queryByText("Open in a window")).toBeNull();
      expect(screen.queryByText("Finished long ago")).toBeNull();
      // Unknown directory, no project.
      expect(screen.getByText("No project")).toBeTruthy();
      expect(screen.getByText("Scratch")).toBeTruthy();
    });

    it("opens a background session in a new canvas session", () => {
      seed([{ id: "a", windows: [] }], "a");
      const { manager, onOpenCanvas } = mount();
      act(() =>
        pushSnapshot({
          sessions: [claudeSession({ key: "bg", projectId: "p1" })],
          external: [],
          available: true,
        }),
      );

      fireEvent.click(screen.getByTitle(/Fix calendar - Working/));

      const opened = manager().allWindows.find(
        (w) => w.module === "claudeCode",
      );
      expect(opened?.data).toMatchObject({
        claudeSessionKey: "bg",
        projectPath: "/home/me/metron",
        projectName: "metron",
      });
      expect(onOpenCanvas).toHaveBeenCalled();
      // Now shown in a window, it's no longer listed as a background row.
      expect(screen.queryByTitle(/running in the background/)).toBeNull();
    });

    it("ends a session from its row", () => {
      seed([{ id: "a", windows: [] }], "a");
      mount();
      act(() =>
        pushSnapshot({
          sessions: [
            claudeSession({ key: "bg", projectId: "p1", status: "idle" }),
          ],
          external: [],
          available: true,
        }),
      );

      fireEvent.click(screen.getByLabelText("End Fix calendar"));

      expect(claudeSessions.end).toHaveBeenCalledWith("bg");
    });
  });
});

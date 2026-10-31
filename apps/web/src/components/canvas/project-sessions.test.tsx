// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ClaudeSessionsSnapshot,
  ClaudeSessionView,
} from "@/components/claude-sessions/claude-sessions-types";
import { rememberBoard } from "@/components/claude-sessions/session-boards";
import { WorkspaceTemplatesProvider } from "@/hooks/use-workspace-templates";
import { setWindowAgentStatus } from "./canvas-agent-status";
import { ProjectSessions } from "./project-sessions";
import { useWindowManager, WindowManager } from "./window-manager";

const PROJECTS = [
  { id: "p1", name: "metron", path: "/home/me/metron", ssh_host: null },
  { id: "p2", name: "remote", path: "/srv/remote", ssh_host: "me@box" },
  { id: "p3", name: "elsewhere", path: null, ssh_host: null },
];

const env = vi.hoisted(() => ({ desktop: true }));
vi.mock("@/lib/environment", () => ({
  get isDesktop() {
    return env.desktop;
  },
}));

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
      conversationPreview: vi.fn((_cwd: string, sessionId: string) =>
        Promise.resolve({
          opening: null,
          exchanges: [
            { prompt: `latest ask in ${sessionId}`, reply: "On it.", at: 1 },
          ],
        }),
      ),
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

afterEach(() => {
  cleanup();
  env.desktop = true;
});
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

const GROUPS = [...PROJECTS.map((p) => p.name), "No folder"];

/** Rows are nested by order: after their group's header, before the next one. */
function expectInGroup(group: string, row: string) {
  const rowEl = screen.getByText(row);
  const header = screen.getByText(group);
  const next = GROUPS.slice(GROUPS.indexOf(group) + 1)
    .map((name) => screen.queryByText(name))
    .find((el) => el !== null);
  expect(
    header.compareDocumentPosition(rowEl) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  if (next) {
    expect(
      rowEl.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
}

describe("ProjectSessions", () => {
  it("nests sessions under their project and files the rest under No folder", () => {
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
    expectInGroup("metron", "Refactor");
    expectInGroup("No folder", "Orphaned");
    expectInGroup("No folder", "Scratch");
    // The project's badge sums windows across its sessions; the session's own
    // badge shows its count.
    expect(screen.getAllByText("2")).toHaveLength(2);
  });

  it("leaves out the empty, unnamed session outside a folder until it's on screen", () => {
    seed(
      [
        { id: "a", projectId: "p1", name: "Refactor", windows: [] },
        { id: "b", windows: [{ module: "tasks", x: 0, y: 0, w: 4, h: 4 }] },
      ],
      "a",
    );
    const { manager } = mount();
    act(() => manager().addWorkspace());
    const blank = manager().activeWorkspaceId;
    act(() => manager().switchWorkspace("a"));
    expect(screen.getByText("No folder")).toBeTruthy();
    expect(screen.queryByText("Session")).toBeNull();

    act(() => manager().removeWorkspace("b"));
    expect(manager().workspaces.map((ws) => ws.id)).toContain(blank);
    expect(screen.queryByText("No folder")).toBeNull();

    act(() => manager().switchWorkspace(blank));
    expect(screen.getByText("No folder")).toBeTruthy();
  });

  it("lists an unnamed session outside a folder once it has widgets", () => {
    seed(
      [
        { id: "a", projectId: "p1", name: "Refactor", windows: [] },
        {
          id: "b",
          windows: [{ module: "tasks", x: 0, y: 0, w: 4, h: 4 }],
        },
      ],
      "a",
    );
    mount();
    expect(screen.getByText("No folder")).toBeTruthy();
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

  it("calls its folders code, apart from tasks' projects", () => {
    seed([{ id: "a", windows: [] }], "a");
    mount();
    expect(screen.getByText("Code")).toBeTruthy();
    expect(screen.queryByText("Projects")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Add code folder" }),
    ).toBeTruthy();
  });

  it("invites adding a first project when there are none", () => {
    seed([{ id: "a", windows: [] }], "a");
    mount();
    expect(screen.queryByText("Add your first code folder")).toBeNull();
    cleanup();

    projectsMock.list = [];
    mount();
    expect(screen.getByText("Add your first code folder")).toBeTruthy();
  });

  it("stays out of a browser for someone with no folders or sessions to switch", () => {
    env.desktop = false;
    projectsMock.list = [];
    seed([{ id: "a", windows: [] }], "a");
    mount();
    expect(screen.queryByText("Code")).toBeNull();
    expect(screen.queryByText("Add your first code folder")).toBeNull();
    cleanup();

    seed(
      [
        { id: "a", name: "Board", windows: [] },
        { id: "b", name: "Scratch", windows: [] },
      ],
      "a",
    );
    mount();
    expect(screen.getByText("Code")).toBeTruthy();
    expect(screen.queryByText("Add your first code folder")).toBeNull();
    cleanup();

    projectsMock.list = PROJECTS;
    seed([{ id: "a", windows: [] }], "a");
    mount();
    expect(screen.getByText("metron")).toBeTruthy();
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
  describe("previews on hover", () => {
    function seedCanvas() {
      seed(
        [
          {
            id: "a",
            projectId: "p1",
            name: "With Claude",
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
          {
            id: "b",
            projectId: "p1",
            name: "Just tasks",
            windows: [{ module: "tasks", x: 0, y: 0, w: 4, h: 4 }],
          },
        ],
        "a",
      );
      mount();
      act(() =>
        pushSnapshot({
          sessions: [
            claudeSession({ key: "shown", sessionId: "in-window" }),
            claudeSession({
              key: "bg",
              name: "Fix calendar",
              sessionId: "in-background",
              cwd: "/home/me/other",
            }),
          ],
          external: [],
          available: true,
        }),
      );
    }

    it("shows the conversation a canvas session runs", async () => {
      seedCanvas();

      fireEvent.pointerEnter(screen.getByTitle("With Claude"), {
        pointerType: "mouse",
      });

      expect(await screen.findByText("latest ask in in-window")).toBeTruthy();
      expect(claudeSessions.conversationPreview).toHaveBeenLastCalledWith(
        "/home/me/metron",
        "in-window",
      );
    });

    it("shows the conversation of a session running in the background", async () => {
      seedCanvas();

      fireEvent.pointerEnter(
        screen.getByTitle(/Fix calendar - Working/)
          .parentElement as HTMLElement,
        { pointerType: "mouse" },
      );

      expect(
        await screen.findByText("latest ask in in-background"),
      ).toBeTruthy();
      expect(claudeSessions.conversationPreview).toHaveBeenLastCalledWith(
        "/home/me/other",
        "in-background",
      );
    });

    it("shows nothing for a canvas session without Claude", async () => {
      seedCanvas();
      claudeSessions.conversationPreview.mockClear();

      fireEvent.pointerEnter(screen.getByTitle("Just tasks"), {
        pointerType: "mouse",
      });
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(screen.queryByText(/latest ask/)).toBeNull();
      expect(claudeSessions.conversationPreview).not.toHaveBeenCalled();
    });

    it("reads a running conversation again on each hover", async () => {
      seedCanvas();
      const row = screen.getByTitle("With Claude");

      fireEvent.pointerEnter(row, { pointerType: "mouse" });
      await screen.findByText("latest ask in in-window");
      fireEvent.pointerLeave(row, { pointerType: "mouse" });
      await waitFor(() =>
        expect(screen.queryByText("latest ask in in-window")).toBeNull(),
      );
      const calls = claudeSessions.conversationPreview.mock.calls.length;
      fireEvent.pointerEnter(row, { pointerType: "mouse" });
      await screen.findByText("latest ask in in-window");

      expect(claudeSessions.conversationPreview.mock.calls.length).toBe(
        calls + 1,
      );
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

      expectInGroup("metron", "Fix calendar");
      expect(screen.queryByText("Open in a window")).toBeNull();
      expect(screen.queryByText("Finished long ago")).toBeNull();
      // Unknown directory, no project.
      expectInGroup("No folder", "Scratch");
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
      // Now shown in a window, it's no longer listed as a row of its own.
      expect(screen.queryByTitle(/no window open/)).toBeNull();
    });

    it("reopens a session in the canvas session it was last shown in, not a new one", () => {
      seed(
        [
          { id: "a", name: "Board", windows: [] },
          {
            id: "b",
            name: "Earlier",
            projectId: "p1",
            windows: [{ module: "tasks", x: 0, y: 0, w: 4, h: 4 }],
          },
        ],
        "a",
      );
      rememberBoard("bg", "b");
      const { manager } = mount();
      act(() =>
        pushSnapshot({
          sessions: [claudeSession({ key: "bg", projectId: "p1" })],
          external: [],
          available: true,
        }),
      );
      const boards = manager().workspaces.length;

      fireEvent.click(
        screen.getByTitle(/Fix calendar - Working, no window open/),
      );

      const opened = manager().allWindows.find(
        (w) => w.module === "claudeCode",
      );
      expect(opened?.workspaceId).toBe("b");
      expect(manager().activeWorkspaceId).toBe("b");
      expect(manager().workspaces).toHaveLength(boards);
    });

    it("opens a new canvas session when the one it was in is gone", () => {
      seed([{ id: "a", windows: [] }], "a");
      rememberBoard("bg", "deleted");
      const { manager } = mount();
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
      expect(opened?.workspaceId).not.toBe("deleted");
      expect(opened?.workspaceId).not.toBe("a");
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

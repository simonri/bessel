// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useWindowManager,
  WindowManager,
} from "@/components/canvas/window-manager";
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

const CONVERSATIONS = [
  {
    sessionId: "c-running",
    title: "Calendar sync",
    updatedAt: Date.now() - 2 * 3_600_000,
  },
  {
    sessionId: "c-old",
    title: "Widget icons",
    updatedAt: Date.now() - 3 * 86_400_000,
  },
];
const RUNNING = {
  key: "k-running",
  bgId: "ba084a19",
  // Resumed from the "c-running" conversation, so it carries a new id now.
  sessionId: "s-resumed",
  name: "Calendar sync",
  cwd: "/home/me/metron",
  projectId: "p1",
  createdAt: 1,
  endedAt: null,
  status: "idle",
  remoteUrl: null,
  conversationIds: ["s-resumed", "c-running"],
};
const claudeSessions = {
  snapshot: vi.fn(async () => ({
    sessions: [RUNNING],
    external: [],
    available: true,
  })),
  onChanged: vi.fn(() => () => {}),
  conversations: vi.fn(async () => CONVERSATIONS),
  create: vi.fn(async () => RUNNING),
};
Object.defineProperty(window, "electron", {
  value: { claudeSessions },
  configurable: true,
});

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  claudeSessions.create.mockClear();
  claudeSessions.conversations.mockClear();
});

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
      <NewSessionPage
        projectId={projectId}
        onCancel={onCancel}
        onCreated={onCreated}
      />
    </WindowManager>,
  );
  return { manager: () => captured!, onCancel, onCreated };
}

const openOptions = () =>
  fireEvent.click(screen.getByRole("button", { name: /Options/ }));

describe("NewSessionPage", () => {
  it("preselects the project and opens N agents tiled evenly into a new session", () => {
    const { manager, onCreated } = mount("p2");
    openOptions();
    expect(
      (screen.getByRole("radio", { name: /^remote/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);

    fireEvent.click(screen.getByLabelText("Codex"));
    fireEvent.click(screen.getByLabelText("3"));
    fireEvent.change(screen.getByLabelText("Session name"), {
      target: { value: "Trio" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Open 3 × Codex in remote/ }),
    );

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
    expect(
      (screen.getByRole("radio", { name: /^No project/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Open Claude$/ }));
    const { windows, workspaces, activeWorkspaceId } = manager();
    expect(windows.map((w) => w.module)).toEqual(["claudeCode"]);
    expect(windows[0]).toMatchObject({
      x: 0,
      y: 0,
      w: 24,
      h: 20,
      data: { claudeSessionName: "Claude" },
    });
    expect(
      workspaces.find((ws) => ws.id === activeWorkspaceId)?.projectId,
    ).toBeUndefined();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Empty session opens a new session with no widgets, keeping the chosen project and name", () => {
    const { manager, onCreated } = mount("p1");
    openOptions();
    fireEvent.change(screen.getByLabelText("Session name"), {
      target: { value: "Scratch" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Empty session" }));

    expect(onCreated).toHaveBeenCalledTimes(1);
    const { workspaces, activeWorkspaceId, windows } = manager();
    expect(windows).toHaveLength(0);
    expect(workspaces.find((ws) => ws.id === activeWorkspaceId)).toEqual({
      id: activeWorkspaceId,
      name: "Scratch",
      projectId: "p1",
    });
  });

  it("resumes a past conversation of the project in a single window", async () => {
    const { manager, onCreated } = mount("p1");
    openOptions();
    fireEvent.click(screen.getByLabelText("3"));
    fireEvent.click(await screen.findByRole("radio", { name: /Widget icons/ }));

    expect((screen.getByLabelText("1") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("3") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(claudeSessions.conversations).toHaveBeenCalledWith(
      "/home/me/metron",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Resume conversation" }),
    );

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(manager().windows.map((w) => w.data)).toEqual([
      {
        projectPath: "/home/me/metron",
        projectName: "metron",
        claudeSessionName: "Widget icons",
        claudeSessionId: "c-old",
      },
    ]);
  });

  it("starts sessions in the background without opening windows", async () => {
    const { manager, onCancel, onCreated } = mount("p1");
    openOptions();
    fireEvent.click(screen.getByLabelText("2"));
    fireEvent.click(screen.getByRole("radio", { name: /In background/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Start 2 in background in metron" }),
    );

    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(claudeSessions.create).toHaveBeenCalledTimes(2);
    expect(claudeSessions.create).toHaveBeenCalledWith({
      cwd: "/home/me/metron",
      name: "metron",
      projectId: "p1",
      resumeSessionId: undefined,
    });
    expect(onCreated).not.toHaveBeenCalled();
    expect(manager().windows).toHaveLength(0);
  });

  it("opens a conversation that's already running instead of starting another", async () => {
    const { manager } = mount("p1");
    const option = await screen.findByRole("radio", { name: /Calendar sync/ });
    expect(screen.getByText("Running")).toBeTruthy();
    fireEvent.click(option);

    fireEvent.click(
      screen.getByRole("button", { name: "Open running session" }),
    );

    expect(claudeSessions.create).not.toHaveBeenCalled();
    expect(manager().windows.map((w) => w.data)).toEqual([
      {
        claudeSessionKey: "k-running",
        projectPath: "/home/me/metron",
        projectName: "metron",
      },
    ]);
  });

  it("keeps SSH projects to opening windows", () => {
    mount("p2");
    expect(screen.queryByRole("radio", { name: /In background/ })).toBeNull();
    expect(claudeSessions.conversations).not.toHaveBeenCalled();
  });
});

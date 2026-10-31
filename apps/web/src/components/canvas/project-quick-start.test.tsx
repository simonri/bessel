// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  ClaudeConversation,
  ClaudeSessionsSnapshot,
} from "@/components/claude-sessions/claude-sessions-types";
import { WorkspaceTemplatesProvider } from "@/hooks/use-workspace-templates";
import type { ProjectWithPath } from "./project-picker-menu";
import { ProjectQuickStart } from "./project-quick-start";
import { useWindowManager, WindowManager } from "./window-manager";

// Hoisted: the window manager and isDesktop read window.electron at import.
const claude = vi.hoisted(() => {
  const api = {
    snapshot: vi.fn(
      async (): Promise<ClaudeSessionsSnapshot> => ({
        sessions: [],
        external: [],
        available: true,
      }),
    ),
    onChanged: vi.fn(() => () => {}),
    create: vi.fn(async () => ({ name: "metron" })),
    conversations: vi.fn(
      async (): Promise<ClaudeConversation[]> => [
        { sessionId: "c-1", title: "Widget icons", updatedAt: Date.now() },
      ],
    ),
    conversationPreview: vi.fn(async () => ({
      opening: "Redraw the widget icons",
      exchanges: [
        { prompt: "make them thinner", reply: "Done, 1.5px strokes.", at: 1 },
      ],
    })),
  };
  Object.defineProperty(window, "electron", {
    value: { claudeSessions: api },
    configurable: true,
  });
  return api;
});

vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ data: [], isSuccess: true }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PROJECT: ProjectWithPath = {
  id: "p1",
  name: "metron",
  path: "/home/me/metron",
  ssh_host: null,
} as ProjectWithPath;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

function mount() {
  let manager: ReturnType<typeof useWindowManager> | undefined;
  const onShowCanvas = vi.fn();
  const onMoreOptions = vi.fn();
  function Harness() {
    manager = useWindowManager();
    const [open, setOpen] = useState(true);
    return (
      <ProjectQuickStart
        project={PROJECT}
        open={open}
        onOpenChange={setOpen}
        onShowCanvas={onShowCanvas}
        onMoreOptions={onMoreOptions}
      >
        <button type="button">metron</button>
      </ProjectQuickStart>
    );
  }
  render(
    <WindowManager>
      <WorkspaceTemplatesProvider>
        <Harness />
      </WorkspaceTemplatesProvider>
    </WindowManager>,
  );
  return { manager: () => manager!, onShowCanvas, onMoreOptions };
}

function claudeWindows(manager: ReturnType<typeof useWindowManager>) {
  return manager.allWindows.filter((w) => w.module === "claudeCode");
}

// The menu puts focus on its first item a frame after opening; wait for that,
// or it can land after the submenu opened and take focus back from it.
async function openConversations() {
  const claudeItem = await screen.findByRole("menuitem", { name: /^Claude/ });
  await waitFor(() => expect(document.activeElement).toBe(claudeItem));
  const sub = screen.getByRole("menuitem", { name: /Continue a conversation/ });
  act(() => sub.focus());
  fireEvent.keyDown(sub, { key: "ArrowRight" });
  return sub;
}

describe("ProjectQuickStart", () => {
  it("starts Claude on Enter in a session that closes when emptied", async () => {
    const { manager, onShowCanvas } = mount();
    const item = await screen.findByRole("menuitem", {
      name: (name) => name.startsWith("Claude") && !name.includes("background"),
    });
    await waitFor(() => expect(document.activeElement).toBe(item));

    fireEvent.keyDown(item, { key: "Enter" });

    const [win] = claudeWindows(manager());
    expect(win.data).toMatchObject({
      projectPath: "/home/me/metron",
      projectName: "metron",
      claudeSessionName: "metron",
    });
    const session = manager().workspaces.find(
      (ws) => ws.id === win.workspaceId,
    );
    expect(session).toMatchObject({ projectId: "p1", closeWhenEmpty: true });
    expect(onShowCanvas).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("has one way to start Claude: a window, which can close and leave it running", async () => {
    mount();
    await screen.findByRole("menuitem", { name: /^Claude/ });

    expect(screen.queryByRole("menuitem", { name: /background/i })).toBeNull();
    expect(claude.create).not.toHaveBeenCalled();
  });

  it("continues a past conversation", async () => {
    const { manager } = mount();
    await openConversations();
    const item = await screen.findByRole("menuitem", { name: /^Widget icons/ });
    fireEvent.keyDown(item, { key: "Enter" });

    expect(claude.conversations).toHaveBeenCalledWith("/home/me/metron");
    expect(claudeWindows(manager())[0].data).toMatchObject({
      claudeSessionId: "c-1",
      claudeSessionName: "Widget icons",
    });
  });

  it("previews the conversation an item highlights", async () => {
    mount();
    const sub = await openConversations();
    const item = await screen.findByRole("menuitem", { name: /^Widget icons/ });
    expect(screen.queryByText("make them thinner")).toBeNull();

    fireEvent.pointerMove(item, { pointerType: "mouse" });

    expect(await screen.findByText("make them thinner")).toBeTruthy();
    expect(screen.getByText("Done, 1.5px strokes.")).toBeTruthy();
    expect(claude.conversationPreview).toHaveBeenCalledWith(
      "/home/me/metron",
      "c-1",
    );

    act(() => sub.focus());
    await waitFor(() =>
      expect(screen.queryByText("make them thinner")).toBeNull(),
    );
  });

  it("offers no second way to continue a conversation", async () => {
    mount();
    await openConversations();
    await screen.findByRole("menuitem", { name: /^Widget icons/ });

    expect(screen.queryByRole("menuitem", { name: /background/i })).toBeNull();
  });

  it("opens an empty session under the project", async () => {
    const { manager, onShowCanvas } = mount();
    const before = manager().workspaces.length;
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Empty session/ }),
    );

    expect(manager().workspaces).toHaveLength(before + 1);
    expect(manager().workspaces.at(-1)?.projectId).toBe("p1");
    expect(onShowCanvas).toHaveBeenCalled();
  });

  it("hands the rest to the full New session page", async () => {
    const { onMoreOptions } = mount();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /More options/ }),
    );
    expect(onMoreOptions).toHaveBeenCalled();
  });
});

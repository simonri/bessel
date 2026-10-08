// @vitest-environment jsdom
import type { TaskSchema } from "@bessel/client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeSessionView } from "@/components/claude-sessions/claude-sessions-types";
import { SendToClaudeDialog } from "./send-to-claude";

const session = (
  key: string,
  name: string,
  status: ClaudeSessionView["status"],
  cwd = "/repo/other",
) =>
  ({
    key,
    name,
    status,
    cwd,
    projectId: null,
    bgId: key,
    sessionId: "",
    conversationIds: [],
  }) as unknown as ClaudeSessionView;

const state = vi.hoisted(() => ({
  sessions: [] as ClaudeSessionView[],
  send: vi.fn(),
  create: vi.fn(),
  start: vi.fn(),
}));

vi.mock(
  "@/components/claude-sessions/claude-sessions-store",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useClaudeSessions: () => ({
      sessions: state.sessions,
      external: [],
      available: true,
    }),
    getClaudeSessionsSnapshot: () => ({
      sessions: state.sessions,
      external: [],
      available: true,
    }),
    claudeSessionsApi: () => ({ send: state.send, create: state.create }),
  }),
);
vi.mock("@/components/canvas/project-picker-menu", () => ({
  useProjectsWithPath: () => [
    { id: "p1", name: "Bessel", path: "/repo/bessel", ssh_host: null },
  ],
}));
vi.mock("@/components/claude-sessions/use-open-claude-session", () => ({
  useOpenClaudeSession: () => vi.fn(),
}));
vi.mock("@/hooks/use-task-status-actions", () => ({
  useTaskStatusActions: () => ({ start: state.start }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TASKS = [
  { id: "t1", title: "Fix login", status: "todo", project: "Bessel" },
  { id: "t2", title: "Dark map", status: "in_progress", project: "Bessel" },
] as TaskSchema[];

function mount(onSent = vi.fn()) {
  render(
    <SendToClaudeDialog
      open
      onOpenChange={() => {}}
      tasks={TASKS}
      onSent={onSent}
    />,
  );
  return onSent;
}

beforeEach(() => {
  state.send.mockReset().mockResolvedValue(undefined);
  state.create.mockReset();
  state.start.mockReset();
});
afterEach(cleanup);

describe("SendToClaudeDialog", () => {
  it("offers only free sessions, the tasks' project first", () => {
    state.sessions = [
      session("a", "Elsewhere", "idle"),
      session("b", "Bessel work", "idle", "/repo/bessel"),
      session("c", "Busy one", "working", "/repo/bessel"),
    ];
    mount();
    const rows = screen
      .getAllByRole("button")
      .filter((b) =>
        /Elsewhere|Bessel work|Busy one/.test(b.textContent ?? ""),
      );
    expect(
      rows.map((r) =>
        r.textContent?.replace(/(Free|Working on something)$/, ""),
      ),
    ).toEqual(["Bessel work", "Busy one", "Elsewhere"]);
    expect(screen.getByRole("button", { name: /Busy one/ })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("sends the batch and starts the to-do tasks", async () => {
    state.sessions = [session("b", "Bessel work", "idle", "/repo/bessel")];
    const onSent = mount();
    fireEvent.click(screen.getByRole("button", { name: /Bessel work/ }));

    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const [key, prompt] = state.send.mock.calls[0];
    expect(key).toBe("b");
    expect(prompt).toContain("Fix login (task_id: t1)");
    expect(prompt).toContain('status "in_review"');
    expect(state.start.mock.calls.map(([t]) => t.id)).toEqual(["t1"]);
  });

  it("starts a session when none is free, and sends once it runs", async () => {
    state.sessions = [session("c", "Busy one", "working")];
    state.create.mockImplementation(async () => {
      state.sessions = [
        ...state.sessions,
        session("new", "Bessel", "idle", "/repo/bessel"),
      ];
      return state.sessions.at(-1);
    });
    const onSent = mount();
    expect(
      screen.getByText("No session is free. Start a new one"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /In Bessel/ }));

    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(state.create).toHaveBeenCalledWith({
      cwd: "/repo/bessel",
      name: "Bessel",
      projectId: "p1",
    });
    expect(state.send.mock.calls[0][0]).toBe("new");
  });
});

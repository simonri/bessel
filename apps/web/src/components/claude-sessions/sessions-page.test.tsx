// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ClaudeSessionsSnapshot,
  ClaudeSessionView,
} from "./claude-sessions-types";

const state = vi.hoisted(() => ({
  snapshot: { sessions: [], external: [], available: true } as unknown,
}));
const api = vi.hoisted(() => ({
  resume: vi.fn(),
  remove: vi.fn(),
  adopt: vi.fn(),
  end: vi.fn(),
}));
const openSession = vi.hoisted(() => vi.fn());

vi.mock("./claude-sessions-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./claude-sessions-store")>()),
  useClaudeSessions: () => state.snapshot,
  claudeSessionsApi: () => api,
}));
vi.mock("./use-open-claude-session", () => ({
  useOpenClaudeSession: () => openSession,
}));
vi.mock("./remote-link-popover", () => ({
  RemoteLinkPopover: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({
    data: [{ id: "p1", name: "Metron", path: "/home/me/dev/metron" }],
  }),
}));

const { SessionsPage, shortenPath } = await import("./sessions-page");

function session(overrides: Partial<ClaudeSessionView>): ClaudeSessionView {
  return {
    key: "k1",
    bgId: "ba084a19",
    sessionId: "s1",
    name: "Fix calendar",
    cwd: "/home/me/dev/metron",
    projectId: null,
    createdAt: Date.now() - 60_000,
    endedAt: null,
    status: "working",
    remoteUrl: null,
    conversationIds: [],
    ...overrides,
  };
}

function setSnapshot(snapshot: Partial<ClaudeSessionsSnapshot>) {
  state.snapshot = { sessions: [], external: [], available: true, ...snapshot };
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  openSession.mockReset();
});
afterEach(cleanup);

describe("SessionsPage", () => {
  it("shortens home paths", () => {
    expect(shortenPath("/home/me/dev/x")).toBe("~/dev/x");
    expect(shortenPath("/Users/me")).toBe("~");
    expect(shortenPath("/srv/app")).toBe("/srv/app");
  });

  it("lists live and ended sessions with their project", () => {
    setSnapshot({
      sessions: [
        session({}),
        session({
          key: "k2",
          name: "Old work",
          status: "ended",
          endedAt: Date.now(),
        }),
      ],
    });
    render(<SessionsPage />);

    expect(screen.getByText("Fix calendar")).toBeTruthy();
    expect(screen.getByText(/Working - Metron - ~\/dev\/metron/)).toBeTruthy();
    expect(screen.getByText("Ended")).toBeTruthy();
    expect(screen.getByText("Old work")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(openSession).toHaveBeenCalledWith(
      expect.objectContaining({ key: "k1" }),
    );
  });

  it("resumes an ended session and opens it", async () => {
    const resumed = session({ key: "k2", status: "starting" });
    api.resume.mockResolvedValue(resumed);
    setSnapshot({
      sessions: [session({ key: "k2", status: "ended", endedAt: 1 })],
    });
    render(<SessionsPage />);

    fireEvent.click(screen.getByRole("button", { name: /Resume/ }));

    expect(api.resume).toHaveBeenCalledWith("k2");
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledWith(resumed));
  });

  it("adopts a background session started elsewhere", async () => {
    const adopted = session({ key: "k3" });
    api.adopt.mockResolvedValue(adopted);
    setSnapshot({
      external: [
        {
          bgId: "c0ffee00",
          sessionId: "s3",
          name: "From terminal",
          cwd: "/home/me/dev/metron",
          kind: "background",
          status: "idle",
          startedAt: 1,
        },
        {
          bgId: null,
          sessionId: "s4",
          name: "Interactive",
          cwd: "/tmp",
          kind: "interactive",
          status: "working",
          startedAt: 1,
        },
      ],
    });
    render(<SessionsPage />);

    expect(screen.getByText(/Running in a terminal/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(api.adopt).toHaveBeenCalledWith("c0ffee00", "p1");
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledWith(adopted));
  });

  it("warns when the claude CLI isn't available", () => {
    setSnapshot({ available: false });
    render(<SessionsPage />);
    expect(screen.getByText(/Couldn't run the claude CLI/)).toBeTruthy();
    expect(screen.getByText("No sessions running")).toBeTruthy();
  });
});

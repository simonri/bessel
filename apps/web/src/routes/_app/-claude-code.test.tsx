// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UNTRUSTED = "Workspace not trusted";

const state = vi.hoisted(() => ({
  create: vi.fn(),
  trustFolder: vi.fn(),
  windowData: {} as Record<string, string>,
}));

vi.mock("@/components/canvas/window-manager", () => ({
  useWindowEntry: () => ({
    id: "w1",
    workspaceId: "ws1",
    data: state.windowData,
  }),
  useWindowActions: () => ({
    updateWindowData: (_id: string, data: Record<string, string>) =>
      Object.assign(state.windowData, data),
    closeWindow: vi.fn(),
  }),
  useWindowStatus: () => null,
  useWorkspaceMeta: () => ({ workspaces: [{ id: "ws1", projectId: "p1" }] }),
}));
vi.mock("@/components/claude-sessions/claude-sessions-store", () => ({
  claudeSessionsApi: () => ({ create: state.create }),
  isRunning: () => false,
  isUntrustedWorkspaceError: (err: unknown) =>
    err instanceof Error && err.message.includes(UNTRUSTED),
  toAgentStatus: () => null,
  useClaudeSession: () => undefined,
  useClaudeSessionsLoaded: () => true,
}));
vi.mock("@/components/terminal-widget", () => ({
  TerminalWidget: () => <div>terminal</div>,
}));

const { ClaudeCode } = await import("./-claude-code");

beforeEach(() => {
  state.windowData = { projectPath: "/home/me/app", projectName: "app" };
  state.create.mockReset();
  state.trustFolder.mockReset();
  state.create.mockRejectedValue(new Error(UNTRUSTED));
  Object.defineProperty(window, "electron", {
    value: { claude: { trustFolder: state.trustFolder } },
    configurable: true,
  });
});
afterEach(cleanup);

describe("Claude in a folder it doesn't trust yet", () => {
  it("asks once, with what trusting means, then trusts the folder and starts Claude", async () => {
    render(<ClaudeCode />);

    expect(await screen.findByText("Trust this folder?")).toBeTruthy();
    expect(
      screen.getByText(/read, change and run files in \/home\/me\/app/),
    ).toBeTruthy();

    state.trustFolder.mockResolvedValue(true);
    state.create.mockResolvedValue({ key: "k1" });
    fireEvent.click(screen.getByRole("button", { name: "Trust and start" }));

    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(2));
    expect(state.trustFolder).toHaveBeenCalledWith("/home/me/app");
    expect(state.create.mock.calls[1][0]).toMatchObject({
      cwd: "/home/me/app",
    });
  });

  it("says so and doesn't start Claude when the folder couldn't be trusted", async () => {
    render(<ClaudeCode />);
    await screen.findByText("Trust this folder?");

    state.trustFolder.mockRejectedValue(
      new Error("Couldn't read ~/.claude.json"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Trust and start" }));

    expect(
      await screen.findByText("Couldn't read ~/.claude.json"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Trust and start" }),
    ).toBeTruthy();
    expect(state.create).toHaveBeenCalledTimes(1);
  });

  it("treats a trust that didn't stick as a failure", async () => {
    render(<ClaudeCode />);
    await screen.findByText("Trust this folder?");

    state.trustFolder.mockResolvedValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Trust and start" }));

    expect(await screen.findByText(/didn't take the change/)).toBeTruthy();
    expect(state.create).toHaveBeenCalledTimes(1);
  });
});

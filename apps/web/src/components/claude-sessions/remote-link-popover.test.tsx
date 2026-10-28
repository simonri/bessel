// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  url: "https://claude.ai/code/session_1" as string | null,
  openSettings: vi.fn(),
  openExternal: vi.fn(),
  writeText: vi.fn(async (_text: string) => {}),
}));

vi.mock("./claude-sessions-store", () => ({
  useClaudeSession: () => ({ remoteUrl: state.url }),
  claudeSessionsApi: () => ({ remoteUrl: async () => null }),
}));
vi.mock("@/components/settings-dialog-context", () => ({
  useOpenSettings: () => state.openSettings,
}));

const { RemoteLinkPopover } = await import("./remote-link-popover");

function mount() {
  render(
    <RemoteLinkPopover sessionKey="k1">
      <button type="button">Phone</button>
    </RemoteLinkPopover>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Phone" }));
}

beforeEach(() => {
  state.url = "https://claude.ai/code/session_1";
  for (const fn of [state.openSettings, state.openExternal, state.writeText])
    fn.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: state.writeText },
    configurable: true,
  });
  Object.defineProperty(window, "electron", {
    value: { shell: { openExternal: state.openExternal } },
    configurable: true,
  });
});
afterEach(cleanup);

describe("RemoteLinkPopover", () => {
  it("offers the session's link to copy or open, without a QR code", async () => {
    mount();

    fireEvent.click(await screen.findByRole("button", { name: /Copy link/ }));
    expect(state.writeText).toHaveBeenCalledWith(
      "https://claude.ai/code/session_1",
    );
    fireEvent.click(screen.getByRole("button", { name: /^Open$/ }));
    expect(state.openExternal).toHaveBeenCalledWith(
      "https://claude.ai/code/session_1",
    );
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("leads to starting sessions from the phone and its notifications", async () => {
    mount();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Start new sessions from your phone/,
      }),
    );
    expect(state.openSettings).toHaveBeenCalledWith("claude");
  });

  it("waits for the link while Remote Control connects", async () => {
    state.url = null;
    mount();

    await waitFor(() =>
      expect(
        screen.getByText("Waiting for Remote Control to connect…"),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: /Copy link/ })).toBeNull();
  });
});

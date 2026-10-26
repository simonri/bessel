// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const openSettings = vi.hoisted(() => vi.fn());
vi.mock("@/components/settings-dialog", () => ({
  useOpenSettings: () => openSettings,
}));

const { ConnectInSettings } = await import("./connect-in-settings");

afterEach(() => {
  cleanup();
  openSettings.mockReset();
});

describe("ConnectInSettings", () => {
  it("opens Integrations where new things are added", () => {
    render(<ConnectInSettings label="Connect Google" />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Google" }));

    expect(openSettings).toHaveBeenCalledWith("integrations", "add");
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/settings-modal", () => ({
  SettingsModal: ({
    open,
    page,
    onClose,
  }: {
    open: boolean;
    page: string;
    onClose: () => void;
  }) =>
    open ? (
      <div role="dialog">
        showing {page}
        <button type="button" onClick={onClose}>
          close
        </button>
      </div>
    ) : null,
}));

const { SettingsDialogProvider, useCloseSettings, useOpenSettings } =
  await import("./settings-dialog");

function Opener() {
  const open = useOpenSettings();
  const close = useCloseSettings();
  return (
    <>
      <button type="button" onClick={() => open()}>
        settings
      </button>
      <button type="button" onClick={() => open("integrations")}>
        integrations
      </button>
      <button type="button" onClick={close}>
        leave
      </button>
    </>
  );
}

afterEach(cleanup);

describe("SettingsDialogProvider", () => {
  it("opens Settings at the page asked for, and where it was left otherwise", () => {
    render(
      <SettingsDialogProvider>
        <Opener />
      </SettingsDialogProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByText("settings"));
    expect(screen.getByRole("dialog").textContent).toContain(
      "showing appearance",
    );

    fireEvent.click(screen.getByText("close"));
    fireEvent.click(screen.getByText("integrations"));
    expect(screen.getByRole("dialog").textContent).toContain(
      "showing integrations",
    );

    fireEvent.click(screen.getByText("leave"));
    fireEvent.click(screen.getByText("settings"));
    expect(screen.getByRole("dialog").textContent).toContain(
      "showing integrations",
    );
  });

  it("closes when a page asks", () => {
    render(
      <SettingsDialogProvider>
        <Opener />
      </SettingsDialogProvider>,
    );
    fireEvent.click(screen.getByText("integrations"));

    fireEvent.click(screen.getByText("leave"));

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileNavDrawer } from "./mobile-nav-drawer";

afterEach(cleanup);

function renderDrawer(open: boolean) {
  const onClose = vi.fn();
  render(
    <MobileNavDrawer open={open} onClose={onClose}>
      <nav aria-label="Pages">Today</nav>
    </MobileNavDrawer>,
  );
  return onClose;
}

describe("MobileNavDrawer", () => {
  it("shows nothing while closed", () => {
    renderDrawer(false);
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close menu" })).toBeNull();
  });

  it("shows the sidebar and closes on a tap outside it", () => {
    const onClose = renderDrawer(true);
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape, but only while open", () => {
    const onClose = renderDrawer(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();

    const closedOnClose = renderDrawer(false);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closedOnClose).not.toHaveBeenCalled();
  });
});

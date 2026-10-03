// @vitest-environment jsdom
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@bessel/ui/components/context-menu";
import { TooltipProvider } from "@bessel/ui/components/tooltip";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eventColor } from "./event-colors";
import {
  DeletePrompt,
  EventContextMenu,
  type EventMenuOptions,
} from "./event-context-menu";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function openMenu(colorId: string | null, options: EventMenuOptions) {
  const onColor = vi.fn();
  const onDelete = vi.fn();
  render(
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger>Standup</ContextMenuTrigger>
        <EventContextMenu
          colorId={colorId}
          options={options}
          onColor={onColor}
          onDelete={onDelete}
        />
      </ContextMenu>
    </TooltipProvider>,
  );
  fireEvent.contextMenu(screen.getByText("Standup"));
  return { onColor, onDelete };
}

describe("eventColor", () => {
  it("maps Google colour ids and ignores unknown ones", () => {
    expect(eventColor("11")).toBe("#e5534b");
    expect(eventColor(null)).toBeNull();
    expect(eventColor("99")).toBeNull();
  });
});

describe("EventContextMenu", () => {
  it("colours the event, and picking the current colour clears it", () => {
    const { onColor } = openMenu("10", { colors: true, delete: true });
    expect(screen.getAllByRole("menuitem")).toHaveLength(8);
    fireEvent.click(screen.getByRole("menuitem", { name: "Red" }));
    expect(onColor).toHaveBeenLastCalledWith("11");

    cleanup();
    const again = openMenu("10", { colors: true, delete: true });
    fireEvent.click(screen.getByRole("menuitem", { name: "Green (clear)" }));
    expect(again.onColor).toHaveBeenLastCalledWith(null);
  });

  it("shows the delete key hint", () => {
    openMenu(null, { colors: false, delete: true });
    expect(screen.getByRole("menuitem", { name: /Delete/ }).textContent).toBe(
      "Deletedelete",
    );
  });

  it("only offers what the event allows", () => {
    const { onDelete } = openMenu(null, { colors: false, delete: true });
    expect(screen.queryByRole("menuitem", { name: "Red" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: /^Delete/ }));
    expect(onDelete).toHaveBeenCalled();

    cleanup();
    openMenu(null, { colors: true, delete: false });
    expect(screen.queryByRole("menuitem", { name: /^Delete/ })).toBeNull();
  });
});

describe("DeletePrompt", () => {
  const anchor = () => document.body.appendChild(document.createElement("div"));

  it("confirms a single event and asks about emailing guests", () => {
    const onConfirm = vi.fn();
    render(
      <DeletePrompt
        anchor={anchor()}
        recurring={false}
        hasGuests
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Email guests/));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledWith("this", false);
  });

  it("asks which occurrences of a repeating event", () => {
    const onConfirm = vi.fn();
    render(
      <DeletePrompt
        anchor={anchor()}
        recurring
        hasGuests={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Email guests/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "This and following events" }),
    );
    expect(onConfirm).toHaveBeenCalledWith("following", false);
  });

  it("cancels", () => {
    const onCancel = vi.fn();
    render(
      <DeletePrompt
        anchor={anchor()}
        recurring={false}
        hasGuests={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

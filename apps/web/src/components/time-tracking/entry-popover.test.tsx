// @vitest-environment jsdom
import type { TimeProjectSchema } from "@bessel/client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EntryPopover, type EntrySubject } from "./entry-popover";

beforeAll(() => {
  // Radix popper measures its anchor with ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function project(id: string, name: string): TimeProjectSchema {
  return {
    id,
    name,
    client: null,
    color: "#4a9ee0",
    hourly_rate: null,
    currency: null,
    archived_at: null,
    created_at: new Date(),
    modified_at: null,
  };
}

const draft: EntrySubject = {
  entryId: null,
  start: new Date(2026, 9, 6, 9, 0),
  end: new Date(2026, 9, 6, 11, 30),
  projectId: "a",
  note: "",
};

function setup(
  subject: EntrySubject = draft,
  projects = [project("a", "Audit"), project("b", "Migration")],
) {
  const anchor = document.createElement("div");
  document.body.appendChild(anchor);
  const handlers = {
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    onCreateProject: vi.fn(async (name: string) => project("c", name)),
  };
  render(
    <EntryPopover
      subject={subject}
      anchor={anchor}
      projects={projects}
      {...handlers}
    />,
  );
  return handlers;
}

describe("EntryPopover", () => {
  it("shows the time span and logs it to the picked project with a note", () => {
    const { onSave } = setup();
    expect(screen.getByText(/Tue 6 Oct, 09:00-11:30 - 2.5 h/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Migration/ }));
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: " Schema review " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log time" }));

    expect(onSave).toHaveBeenCalledWith("b", "Schema review");
  });

  it("picks a project with its number key", () => {
    const { onSave } = setup();
    fireEvent.keyDown(screen.getByRole("button", { name: /Audit/ }), {
      key: "2",
    });
    fireEvent.click(screen.getByRole("button", { name: "Log time" }));
    expect(onSave).toHaveBeenCalledWith("b", "");
  });

  it("adds a first project inline and selects it", async () => {
    const { onCreateProject, onSave } = setup(
      { ...draft, projectId: null },
      [],
    );
    expect(
      (screen.getByRole("button", { name: "Log time" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    const input = screen.getByLabelText("New project name");
    fireEvent.change(input, { target: { value: "Acme" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledWith("Acme"));
    // The parent would pass the new project in; the picked id carries over.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Log time" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Log time" }));
    expect(onSave).toHaveBeenCalledWith("c", "");
  });

  it("offers no delete for a draft and labels its submit Log time", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Delete entry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Log time" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("offers delete for a saved entry and labels its submit Save", () => {
    const { onDelete } = setup({ ...draft, entryId: "e1" });
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Log time" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    expect(onDelete).toHaveBeenCalled();
  });
});

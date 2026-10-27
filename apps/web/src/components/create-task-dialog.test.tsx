// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@bessel/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@bessel/client")>();
  return {
    ...actual,
    listProjectsOptions: () => ({
      queryKey: ["projects"],
      queryFn: async () => [
        { id: "p1", name: "Website redesign" },
        { id: "p2", name: "Uni" },
      ],
    }),
    createTaskMutation: () => ({ mutationFn: api.create }),
  };
});

const { TaskFormDialog, dueDateQuickPicks } = await import(
  "./create-task-dialog"
);

/** A Tuesday. */
const NOW = new Date(2026, 9, 27, 12, 0);

function mount() {
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TaskFormDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  api.create.mockReset();
  api.create.mockImplementation(async (vars) => ({
    id: "t1",
    ...vars.body,
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const dueInput = () => screen.getByLabelText("Due date") as HTMLInputElement;

const pressedPicks = () =>
  screen
    .getAllByRole("button", { pressed: true })
    .map((button) => button.textContent);

async function submit(title = "Water the plants") {
  fireEvent.change(screen.getByLabelText(/Title/), {
    target: { value: title },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
  return api.create.mock.calls[0][0].body;
}

describe("TaskFormDialog", () => {
  it("closes the project suggestions on the first Escape and the dialog on the second", async () => {
    const { onOpenChange } = mount();
    const project = screen.getByPlaceholderText("e.g. Website redesign");

    fireEvent.focus(project);
    fireEvent.change(project, { target: { value: "web" } });
    await screen.findByRole("button", { name: "Website redesign" });

    fireEvent.keyDown(project, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Website redesign" }),
      ).toBeNull(),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(project, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes an open select on the first Escape and the dialog on the second", async () => {
    const { onOpenChange } = mount();
    const recurrence = screen
      .getAllByRole("combobox")
      .find((el) => el.textContent === "No recurrence") as HTMLElement;

    fireEvent.keyDown(recurrence, { key: "Enter" });
    await screen.findByRole("listbox");

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(recurrence, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sets the due date from the quick picks and marks the one in use", async () => {
    mount();
    expect(dueInput().value).toBe("");
    expect(screen.queryAllByRole("button", { pressed: true })).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    expect(dueInput().value).toBe("2026-10-28");
    expect(pressedPicks()).toEqual(["Tomorrow"]);

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(dueInput().value).toBe("2026-11-02");
    expect(pressedPicks()).toEqual(["Next week"]);

    fireEvent.change(dueInput(), { target: { value: "2026-10-27" } });
    expect(pressedPicks()).toEqual(["Today"]);

    fireEvent.change(dueInput(), { target: { value: "2026-10-30" } });
    expect(screen.queryAllByRole("button", { pressed: true })).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    const body = await submit();
    expect(body.due_date).toEqual(new Date("2026-10-27T00:00:00Z"));
  });
});

describe("dueDateQuickPicks", () => {
  it("counts from the given day, with next week on the coming Monday", () => {
    expect(dueDateQuickPicks("2026-10-31")).toEqual([
      { label: "Today", value: "2026-10-31" },
      { label: "Tomorrow", value: "2026-11-01" },
      { label: "Next week", value: "2026-11-02" },
    ]);
  });

  it("puts next week a full week out when today is a Monday", () => {
    expect(dueDateQuickPicks("2026-11-02")[2]).toEqual({
      label: "Next week",
      value: "2026-11-09",
    });
  });
});

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

const { TaskFormDialog } = await import("./create-task-dialog");

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
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  api.create.mockReset();
  api.create.mockImplementation(async (vars) => ({
    id: "t1",
    ...vars.body,
  }));
});
afterEach(cleanup);

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
});

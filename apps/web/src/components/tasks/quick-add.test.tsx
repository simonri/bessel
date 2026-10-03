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

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  createTaskV1TasksPostMutation: () => ({ mutationFn: api.create }),
  listProjectsV1ProjectsGetOptions: () => ({
    queryKey: ["projects"],
    queryFn: async () => [{ id: "p1", name: "Uni" }],
  }),
}));

vi.mock("@/components/create-task-dialog", () => ({
  TaskFormDialog: ({ open }: { open: boolean }) =>
    open ? <div>Full task form</div> : null,
}));

const { QuickAddTask } = await import("./quick-add");

function mount(defaultProject?: string | null) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <QuickAddTask defaultProject={defaultProject} />
    </QueryClientProvider>,
  );
  return screen.getByLabelText("Add a task") as HTMLInputElement;
}

beforeEach(() => {
  api.create.mockReset();
  api.create.mockResolvedValue({ id: "t1" });
});
afterEach(cleanup);

describe("QuickAddTask", () => {
  it("shows recognised parts as chips and creates the task on Enter", async () => {
    const input = mount();
    await waitFor(() => expect(api.create).not.toHaveBeenCalled());

    fireEvent.change(input, {
      target: { value: "Essay draft tomorrow #uni !" },
    });
    await screen.findByText("Uni");
    expect(screen.getByText("Tomorrow")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();

    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    const { body } = api.create.mock.calls[0][0];
    expect(body).toMatchObject({
      title: "Essay draft",
      project: "Uni",
      priority: 3,
      status: "todo",
    });
    expect(body.due_date).toBeInstanceOf(Date);
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("files untagged tasks under the active project filter", async () => {
    const input = mount("Travel");
    fireEvent.change(input, { target: { value: "Pack bags" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0][0].body).toMatchObject({
      title: "Pack bags",
      project: "Travel",
      due_date: null,
      priority: 0,
    });
  });

  it("ignores empty input and clears on Escape", () => {
    const input = mount();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(api.create).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "Something" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });

  it("keeps the input when saving fails", async () => {
    api.create.mockRejectedValue(new Error("nope"));
    const input = mount();
    fireEvent.change(input, { target: { value: "Call mum" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(input.value).toBe("Call mum");
  });

  it("opens the full form", () => {
    mount();
    fireEvent.click(screen.getByLabelText("Add with more options"));
    expect(screen.getByText("Full task form")).toBeTruthy();
  });
});

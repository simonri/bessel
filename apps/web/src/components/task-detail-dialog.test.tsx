// @vitest-environment jsdom
import type { TaskSchema } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  task: null as unknown as TaskSchema,
  update: vi.fn(),
  complete: vi.fn(),
  reopen: vi.fn(),
  deleteAttachment: vi.fn(),
}));

vi.mock("@bessel/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@bessel/client")>();
  return {
    ...actual,
    getTaskOptions: (
      options: Parameters<typeof actual.getTaskQueryKey>[0],
    ) => ({
      queryKey: actual.getTaskQueryKey(options),
      queryFn: async () => api.task,
    }),
    listProjectsOptions: () => ({
      queryKey: ["projects"],
      queryFn: async () => [{ id: "p1", name: "Uni" }],
    }),
    updateTaskMutation: () => ({ mutationFn: api.update }),
    completeTaskMutation: () => ({
      mutationFn: api.complete,
    }),
    reopenTaskMutation: () => ({
      mutationFn: api.reopen,
    }),
    deleteTaskAttachmentMutation: () => ({ mutationFn: api.deleteAttachment }),
  };
});

const { TaskDetailDialogController } = await import("./task-detail-dialog");

const NOW = new Date(2026, 9, 21, 12, 0);

function makeTask(overrides: Partial<TaskSchema> = {}): TaskSchema {
  return {
    id: "t1",
    title: "Write report",
    description: null,
    status: "todo",
    priority: 0,
    due_date: null,
    project: null,
    tags: [],
    attachments: [],
    is_recurring: false,
    created_at: new Date(2026, 9, 1),
    modified_at: new Date(2026, 9, 20),
    completed_at: null,
    ...overrides,
  } as TaskSchema;
}

function Host({
  taskId,
  onOpenChange,
}: {
  taskId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <TaskDetailDialogController
      taskId={open ? taskId : null}
      onOpenChange={(next) => {
        onOpenChange(next);
        setOpen(next);
      }}
    />
  );
}

async function mount(task: TaskSchema = makeTask()) {
  api.task = task;
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Host taskId={task.id} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  await screen.findByRole("dialog");
  return { onOpenChange };
}

/** Lets queued mutations run, so a save that shouldn't happen has had its chance to. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

const bodies = () => api.update.mock.calls.map(([vars]) => vars.body);

async function editTitle(value: string) {
  fireEvent.click(screen.getByTitle("Edit title"));
  const field = screen.getByLabelText("Title");
  fireEvent.change(field, { target: { value } });
  return field;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  for (const fn of [
    api.update,
    api.complete,
    api.reopen,
    api.deleteAttachment,
  ]) {
    fn.mockReset();
    fn.mockResolvedValue(api.task);
  }
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TaskDetailDialogController", () => {
  it("saves the title on Enter and when the field loses focus", async () => {
    await mount();

    fireEvent.keyDown(await editTitle("Write the report"), { key: "Enter" });
    await waitFor(() =>
      expect(bodies()).toEqual([{ title: "Write the report" }]),
    );

    fireEvent.blur(await editTitle("Write the final report"));
    await waitFor(() =>
      expect(bodies()).toEqual([
        { title: "Write the report" },
        { title: "Write the final report" },
      ]),
    );
  });

  it("puts the title back on Escape or when emptied, and Escape in the field keeps the task open", async () => {
    const { onOpenChange } = await mount();

    const field = await editTitle("Something else");
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.getByTitle("Edit title").textContent).toBe("Write report");
    fireEvent.click(screen.getByTitle("Edit title"));
    expect((screen.getByLabelText("Title") as HTMLTextAreaElement).value).toBe(
      "Write report",
    );
    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "Escape" });

    fireEvent.blur(await editTitle("   "));
    expect(screen.getByTitle("Edit title").textContent).toBe("Write report");

    await flush();
    expect(api.update).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("saves a title still being edited exactly once when the task is closed", async () => {
    const { onOpenChange } = await mount();

    await editTitle("Write the report");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(bodies()).toEqual([{ title: "Write the report" }]),
    );
    await flush();
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it("opens links in the description in a new tab without starting an edit", async () => {
    await mount(makeTask({ description: "Spec at https://x.se/spec." }));

    const link = screen.getByRole("link", { name: "x.se/spec" });
    expect(link.getAttribute("href")).toBe("https://x.se/spec");
    expect(link.getAttribute("title")).toBe("https://x.se/spec");
    expect(link.getAttribute("target")).toBe("_blank");

    fireEvent.click(link);
    expect(screen.queryByLabelText("Description")).toBeNull();

    fireEvent.click(screen.getByText(/Spec at/));
    expect(screen.getByLabelText("Description")).toBeTruthy();
  });

  it("removes an inline attachment without starting an edit", async () => {
    await mount(
      makeTask({
        description: "Screenshot below",
        attachments: [
          {
            id: "a1",
            filename: "shot.png",
            content_type: "image/png",
          } as NonNullable<TaskSchema["attachments"]>[number],
        ],
      }),
    );

    fireEvent.click(screen.getByTitle("Remove"));

    await waitFor(() => expect(api.deleteAttachment).toHaveBeenCalledTimes(1));
    expect(api.deleteAttachment.mock.calls[0][0].path).toEqual({
      task_id: "t1",
      attachment_id: "a1",
    });
    expect(screen.queryByLabelText("Description")).toBeNull();
  });

  it("saves the description on ⌘↵ and drops the edit on Escape", async () => {
    await mount(makeTask({ description: "Old notes" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Throwaway" },
    });
    fireEvent.keyDown(screen.getByLabelText("Description"), { key: "Escape" });
    expect(screen.getByText("Old notes")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    const field = screen.getByLabelText("Description") as HTMLTextAreaElement;
    expect(field.value).toBe("Old notes");
    fireEvent.change(field, { target: { value: "New notes" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });

    await waitFor(() =>
      expect(bodies()).toEqual([{ description: "New notes" }]),
    );
  });

  it("offers every empty property and saves a quick due date as that day at UTC midnight", async () => {
    await mount();

    expect(screen.getByText("Add a description…")).toBeTruthy();
    expect(screen.getByText("No project")).toBeTruthy();
    expect(screen.getByText("Add tag")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add due date" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Tomorrow/ }));

    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    expect(bodies()[0].due_date.toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });

  it("adds a tag on Enter and drops a half-typed one on Escape without closing the task", async () => {
    const { onOpenChange } = await mount(makeTask({ tags: ["finance"] }));

    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    fireEvent.change(screen.getByLabelText("New tag"), {
      target: { value: "backend" },
    });
    fireEvent.keyDown(screen.getByLabelText("New tag"), { key: "Enter" });
    await waitFor(() =>
      expect(bodies()).toEqual([{ tags: ["finance", "backend"] }]),
    );

    const field = screen.getByLabelText("New tag");
    fireEvent.change(field, { target: { value: "typo" } });
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);

    expect(screen.queryByLabelText("New tag")).toBeNull();
    await flush();
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("completes an open task and reopens a done one", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Complete/ }));
    await waitFor(() => expect(api.complete).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /Reopen/ })).toBeNull();
    cleanup();

    await mount(
      makeTask({ status: "done", completed_at: new Date(2026, 9, 20, 9) }),
    );
    expect(screen.queryByRole("button", { name: /Complete/ })).toBeNull();
    expect(screen.getByText("20 Oct 2026, 09:00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Reopen/ }));
    await waitFor(() => expect(api.reopen).toHaveBeenCalledTimes(1));
  });

  it("reopens a done task before moving it to another open status", async () => {
    await mount(makeTask({ status: "done" }));

    const trigger = screen.getByRole("button", { name: "Status: Done" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Doing" }));

    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    expect(api.reopen).toHaveBeenCalledTimes(1);
    expect(api.reopen.mock.invocationCallOrder[0]).toBeLessThan(
      api.update.mock.invocationCallOrder[0],
    );
    expect(bodies()).toEqual([{ status: "in_progress" }]);
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("marks a task done through complete, so a routine gets its next occurrence", async () => {
    await mount();

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Status: To do" }),
      {
        button: 0,
        ctrlKey: false,
      },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Done" }));

    await waitFor(() => expect(api.complete).toHaveBeenCalledTimes(1));
    expect(api.update).not.toHaveBeenCalled();
  });
});

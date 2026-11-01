// @vitest-environment jsdom
import type { TaskSchema } from "@bessel/client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskRow } from "./task-row";

afterEach(cleanup);

function task(extra: Partial<TaskSchema> = {}): TaskSchema {
  return {
    id: "t1",
    title: "Water plants",
    status: "todo",
    ...extra,
  } as TaskSchema;
}

describe("TaskRow keyboard", () => {
  it("opens the task on Enter", () => {
    const onSelect = vi.fn();
    render(<TaskRow task={task()} onSelect={onSelect} onComplete={vi.fn()} />);
    const row = screen.getByText("Water plants").closest("[role=button]");
    fireEvent.keyDown(row as Element, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("leaves Enter on the check to the check", () => {
    const onSelect = vi.fn();
    render(<TaskRow task={task()} onSelect={onSelect} onComplete={vi.fn()} />);
    const check = screen.getByRole("button", { name: "Complete Water plants" });
    // Not cancelled, so the browser goes on to click the check.
    expect(fireEvent.keyDown(check, { key: "Enter" })).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("leaves Enter on Reopen to Reopen", () => {
    const onSelect = vi.fn();
    render(
      <TaskRow
        task={task({ status: "done" })}
        onSelect={onSelect}
        onComplete={vi.fn()}
        onReopen={vi.fn()}
      />,
    );
    const reopen = screen.getByRole("button", { name: "Reopen" });
    expect(fireEvent.keyDown(reopen, { key: "Enter" })).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

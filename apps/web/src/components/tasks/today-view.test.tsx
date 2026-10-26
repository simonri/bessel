// @vitest-environment jsdom
import type { TaskSchema } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayView } from "./today-view";

afterEach(cleanup);

function task(id: string, extra: Partial<TaskSchema> = {}): TaskSchema {
  return { id, title: id, status: "todo", ...extra } as TaskSchema;
}

function wrap(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      {node}
    </QueryClientProvider>,
  );
}

describe("TodayView", () => {
  it("shows tasks under their groups and opens one on click", () => {
    const onSelect = vi.fn();
    wrap(
      <TodayView
        tasks={[task("Plan trip", { status: "in_progress" }), task("Buy gift")]}
        onSelectTask={onSelect}
        onCompleteTask={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "Doing" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Someday" })).toBeTruthy();
    fireEvent.click(screen.getByText("Buy gift"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "Buy gift" }),
    );
  });

  it("celebrates an empty list", () => {
    wrap(
      <TodayView
        tasks={[task("x", { status: "done" })]}
        onSelectTask={vi.fn()}
        onCompleteTask={vi.fn()}
      />,
    );
    expect(screen.getByText("All clear ✨")).toBeTruthy();
  });
});

describe("TodayView routines", () => {
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` as unknown as Date;
  };
  const routine = (id: string, offset: number) =>
    task(id, {
      is_recurring: true,
      rrule_frequency: "weekly",
      due_date: day(offset),
    } as Partial<TaskSchema>);

  it("shows a routine in Today on its day and keeps the rest folded away", () => {
    wrap(
      <TodayView
        tasks={[routine("Water plants", 0), routine("Take out recycling", 3)]}
        onSelectTask={vi.fn()}
        onCompleteTask={vi.fn()}
      />,
    );

    const today = screen.getByRole("region", { name: "Today" });
    expect(today.textContent).toContain("Water plants");
    expect(screen.queryByText("Take out recycling")).toBeNull();

    const fold = screen.getByRole("button", { name: /Routines coming up/ });
    expect(fold.textContent).toContain("1");
    fireEvent.click(fold);

    expect(
      screen.getByRole("region", { name: "Routines coming up" }).textContent,
    ).toContain("Take out recycling");
  });

  it("shows routines coming up even when nothing is due", () => {
    wrap(
      <TodayView
        tasks={[routine("Take out recycling", 3)]}
        onSelectTask={vi.fn()}
        onCompleteTask={vi.fn()}
      />,
    );

    expect(screen.getByText("All clear ✨")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Routines coming up/ }),
    ).toBeTruthy();
  });
});

// @vitest-environment jsdom
import type { TaskSchema } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutinesStrip } from "./routines-strip";
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

describe("RoutinesStrip", () => {
  it("lists open recurring tasks only", () => {
    wrap(
      <RoutinesStrip
        tasks={[
          task("Water plants", {
            is_recurring: true,
            rrule_frequency: "daily",
          } as Partial<TaskSchema>),
          task("One-off"),
        ]}
        onSelectTask={vi.fn()}
        onCompleteTask={vi.fn()}
      />,
    );
    expect(screen.getByText("Routines")).toBeTruthy();
    expect(screen.getByText("Water plants")).toBeTruthy();
    expect(screen.getByText("Daily")).toBeTruthy();
    expect(screen.queryByText("One-off")).toBeNull();
  });

  it("renders nothing without routines", () => {
    const { container } = wrap(
      <RoutinesStrip
        tasks={[task("a")]}
        onSelectTask={vi.fn()}
        onCompleteTask={vi.fn()}
      />,
    );
    expect(container.textContent).toBe("");
  });
});

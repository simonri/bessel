// @vitest-environment jsdom
import type { TaskSchema } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DoneSummary } from "./done-summary";
import { ProgressRing } from "./progress-ring";
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

describe("ProgressRing", () => {
  it("shows done of total, and celebrates when finished", () => {
    const { rerender } = render(<ProgressRing done={2} total={5} />);
    expect(screen.getByLabelText("2 of 5 done today").textContent).toContain(
      "2/5",
    );
    rerender(<ProgressRing done={5} total={5} />);
    expect(screen.getByText("All done ✨")).toBeTruthy();
    rerender(<ProgressRing done={0} total={0} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("DoneSummary", () => {
  it("counts this week's wins", () => {
    const { rerender } = render(<DoneSummary count={1} />);
    expect(screen.getByText("You finished 1 thing this week ✨")).toBeTruthy();
    rerender(<DoneSummary count={0} />);
    expect(screen.getByText(/Nothing finished this week yet/)).toBeTruthy();
  });
});

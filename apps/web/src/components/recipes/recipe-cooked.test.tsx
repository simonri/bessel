// @vitest-environment jsdom
import type { RecipeSchema } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const history = vi.hoisted(() => ({ days: [] as string[] }));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listRecipeCooksOptions: () => ({
    queryKey: ["cooks"],
    queryFn: async () => ({
      days: history.days.map((d) => new Date(`${d}T00:00:00Z`)),
    }),
  }),
}));

const { CookedButton, CookedMenu } = await import("./recipe-cooked");

const TODAY = "2026-10-25";

function recipe(days: string[]): RecipeSchema {
  history.days = days;
  return {
    id: "r1",
    title: "Dal",
    cook_count: days.length,
    last_cooked_on: days[0] ? new Date(`${days[0]}T00:00:00Z`) : null,
  } as RecipeSchema;
}

function wrap(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      {node}
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("CookedButton", () => {
  it("logs today", () => {
    const onLog = vi.fn();
    wrap(
      <CookedButton
        recipe={recipe(["2026-10-20"])}
        today={TODAY}
        onLog={onLog}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "I cooked this" }));

    expect(onLog).toHaveBeenCalledWith(TODAY);
  });

  it("shows today as done once it's logged", () => {
    const onLog = vi.fn();
    wrap(
      <CookedButton
        recipe={recipe([TODAY])}
        today={TODAY}
        onLog={onLog}
        pending={false}
      />,
    );

    const button = screen.getByRole("button", { name: "Cooked today" });
    fireEvent.click(button);

    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(onLog).not.toHaveBeenCalled();
  });
});

describe("CookedMenu", () => {
  function open(days: string[]) {
    const onLog = vi.fn();
    const onRemove = vi.fn();
    wrap(
      <CookedMenu
        recipe={recipe(days)}
        today={TODAY}
        onLog={onLog}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cooked|Not cooked/ }));
    return { onLog, onRemove };
  }

  it("says when it was last cooked and how often", () => {
    recipe(["2026-10-20", "2026-09-01"]);
    wrap(
      <CookedMenu
        recipe={recipe(["2026-10-20", "2026-09-01"])}
        today={TODAY}
        onLog={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole("button").textContent).toBe(
      "Cooked 5 days ago - 2 times",
    );
  });

  it("logs yesterday in one tap", () => {
    const { onLog } = open([]);

    fireEvent.click(screen.getByRole("button", { name: "Cooked yesterday" }));

    expect(onLog).toHaveBeenCalledWith("2026-10-24");
  });

  it("logs a day picked from the calendar", () => {
    const { onLog } = open([]);

    fireEvent.change(screen.getByLabelText("Another day"), {
      target: { value: "2026-10-03" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log" }));

    expect(onLog).toHaveBeenCalledWith("2026-10-03");
  });

  it("lists the days it was cooked, each one removable, and offers only days not logged yet", async () => {
    const { onRemove } = open([TODAY, "2026-10-01"]);

    fireEvent.click(
      await screen.findByRole("button", { name: "Remove Thu 1 Oct 2026" }),
    );

    expect(onRemove).toHaveBeenCalledWith("2026-10-01");
    expect(screen.queryByRole("button", { name: "Cooked today" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Cooked yesterday" }),
    ).toBeTruthy();
  });
});

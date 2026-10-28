// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Fact = {
  id: string;
  area: string;
  attribute: string;
  statement: string;
  status: "hypothesis" | "confirmed" | "rejected";
};

const api = vi.hoisted(() => ({
  facts: [] as Fact[],
  fail: false,
  corrected: [] as { id: string; statement: string }[],
  forgotten: [] as string[],
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listMemoryFactsQueryKey: () => ["facts"],
  listMemoryFactsOptions: () => ({
    queryKey: ["facts"],
    queryFn: async () => {
      if (api.fail) throw new Error("down");
      return { facts: api.facts };
    },
  }),
  correctMemoryFactMutation: () => ({
    mutationFn: async ({
      path,
      body,
    }: {
      path: { fact_id: string };
      body: { statement: string };
    }) => {
      api.corrected.push({ id: path.fact_id, statement: body.statement });
      api.facts = api.facts.map((f) =>
        f.id === path.fact_id ? { ...f, statement: body.statement } : f,
      );
    },
  }),
  forgetMemoryFactMutation: () => ({
    mutationFn: async ({ path }: { path: { fact_id: string } }) => {
      api.forgotten.push(path.fact_id);
      api.facts = api.facts.filter((f) => f.id !== path.fact_id);
    },
  }),
}));

const { KnownAboutYou } = await import("./settings-claude-memory");

function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <KnownAboutYou />
    </QueryClientProvider>,
  );
}

const fact = (
  id: string,
  area: string,
  attribute: string,
  statement: string,
  status: Fact["status"] = "confirmed",
): Fact => ({
  id,
  area,
  attribute,
  statement,
  status,
});

beforeEach(() => {
  api.facts = [
    fact("1", "sömn", "sömnmål", "Släckt 02:00, upp 10:15"),
    fact("2", "kropp/kläder", "skostorlek", "44 (EU)"),
    fact("3", "sömn", "kronotyp", "Kvällsmänniska", "hypothesis"),
  ];
  api.fail = false;
  api.corrected = [];
  api.forgotten = [];
});
afterEach(cleanup);

describe("KnownAboutYou", () => {
  it("groups facts by area, alphabetically, and marks guesses", async () => {
    mount();

    await screen.findByText("44 (EU)");
    const areas = screen
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-label"));
    expect(areas).toEqual(["kropp/kläder", "sömn"]);
    const sleep = within(screen.getByRole("region", { name: "sömn" }));
    expect(sleep.getByText("Släckt 02:00, upp 10:15")).toBeTruthy();
    expect(sleep.getByText("Guess")).toBeTruthy();
    expect(screen.getAllByText("Guess")).toHaveLength(1);
    expect(screen.getByText("3 facts in 2 areas")).toBeTruthy();
  });

  it("finds facts by every word typed, across area, attribute and statement", async () => {
    mount();
    await screen.findByText("44 (EU)");

    fireEvent.change(screen.getByLabelText("Search what Claude knows"), {
      target: { value: "SÖMN kväll" },
    });

    expect(screen.queryByText("44 (EU)")).toBeNull();
    expect(screen.queryByText("Släckt 02:00, upp 10:15")).toBeNull();
    expect(screen.getByText("Kvällsmänniska")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search what Claude knows"), {
      target: { value: "nothing like this" },
    });
    expect(screen.getByText("Nothing matches.")).toBeTruthy();
  });

  it("saves a correction", async () => {
    mount();
    await screen.findByText("44 (EU)");

    fireEvent.click(screen.getByRole("button", { name: "Correct skostorlek" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Correct skostorlek" }),
      {
        target: { value: " 45 " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("45");
    expect(api.corrected).toEqual([{ id: "2", statement: "45" }]);
  });

  it("doesn't save an unchanged correction", async () => {
    mount();
    await screen.findByText("44 (EU)");

    fireEvent.click(screen.getByRole("button", { name: "Correct skostorlek" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("44 (EU)");
    expect(api.corrected).toEqual([]);
  });

  it("forgets a fact only after a second click", async () => {
    mount();
    await screen.findByText("44 (EU)");

    fireEvent.click(screen.getByRole("button", { name: "Forget skostorlek" }));
    expect(api.forgotten).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Forget it" }));

    await waitFor(() => expect(screen.queryByText("44 (EU)")).toBeNull());
    expect(api.forgotten).toEqual(["2"]);
  });

  it("says when nothing is known yet, or when it can't load", async () => {
    api.facts = [];
    const { unmount } = mount();
    expect(await screen.findByText(/Nothing yet/)).toBeTruthy();
    unmount();

    api.fail = true;
    mount();
    expect(
      await screen.findByText("Couldn't load what Claude knows."),
    ).toBeTruthy();
  });
});

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
  connector: null as Promise<{ url: string }> | null,
  notes: [] as { key: string; content: string; updated_at: Date }[],
  fail: false,
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  getMcpConnectorOptions: () => ({
    queryKey: ["connector"],
    queryFn: () =>
      api.connector ?? Promise.resolve({ url: "https://api.example.com/mcp" }),
  }),
  listAssistantNotesOptions: () => ({
    queryKey: ["notes"],
    queryFn: async () => {
      if (api.fail) throw new Error("down");
      return { notes: api.notes };
    },
  }),
}));

const { ClaudePage } = await import("./settings-claude-page");

const writeText = vi.fn(async (_text: string) => {});

function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ClaudePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.notes = [];
  api.fail = false;
  api.connector = null;
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});
afterEach(cleanup);

describe("ClaudePage connect", () => {
  it("shows the connector address and copies it", async () => {
    mount();

    expect(await screen.findByText("https://api.example.com/mcp")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy the connector address" }),
    );
    expect(writeText).toHaveBeenCalledWith("https://api.example.com/mcp");
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("waits for the API's address instead of guessing one", () => {
    api.connector = new Promise(() => {});
    mount();

    const copy = screen.getByRole("button", {
      name: "Copy the connector address",
    }) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    expect(screen.queryByText(/\/mcp/)).toBeNull();
    fireEvent.click(copy);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies a Claude Code command for the same address", async () => {
    mount();
    await screen.findByText("https://api.example.com/mcp");

    fireEvent.click(
      screen.getByRole("button", { name: "Copy the Claude Code command" }),
    );
    expect(writeText).toHaveBeenCalledWith(
      "claude mcp add --transport http bessel https://api.example.com/mcp",
    );
  });

  it("walks through adding the connector in Claude", () => {
    mount();

    const steps = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(steps[0]).toContain("Connectors");
    expect(steps[1]).toContain("Add custom connector");
    expect(steps[2]).toContain("Sign in");
  });
});

describe("ClaudePage memory", () => {
  it("lists each note with its key and content, in the order the API gives", async () => {
    api.notes = [
      {
        key: "morgonrapport",
        content: "Sömnsteg 1\nNej tack: Fars dag",
        updated_at: new Date(Date.now() - 60 * 60 * 1000),
      },
      {
        key: "kvallsrapport",
        content: "Gym: 3 dagar",
        updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    ];
    mount();

    await screen.findByText("morgonrapport");
    const keys = screen
      .getAllByRole("heading", { level: 4 })
      .map((h) => h.textContent);
    expect(keys).toEqual(["morgonrapport", "kvallsrapport"]);
    expect(screen.getByText(/Nej tack: Fars dag/)).toBeTruthy();
    expect(screen.getByText("Updated about 1 hour ago")).toBeTruthy();
    expect(screen.getByText("Updated 2 days ago")).toBeTruthy();
  });

  it("folds a long note until asked to show all of it", async () => {
    api.notes = [
      {
        key: "morgonrapport",
        content: Array.from({ length: 10 }, (_, i) => `rad ${i}`).join("\n"),
        updated_at: new Date(),
      },
      { key: "kort", content: "kort", updated_at: new Date() },
    ];
    mount();

    const body = (await screen.findByText(/rad 9/)) as HTMLElement;
    expect(body.className).toContain("line-clamp-6");
    expect(screen.getAllByRole("button", { name: "Show all" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(body.className).not.toContain("line-clamp-6");
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("says when there's nothing yet", async () => {
    mount();

    expect(await screen.findByText(/Nothing yet/)).toBeTruthy();
  });

  it("says when the notes can't be loaded", async () => {
    api.fail = true;
    mount();

    await waitFor(() =>
      expect(screen.getByText("Couldn't load Claude's notes.")).toBeTruthy(),
    );
    expect(screen.queryByText(/Nothing yet/)).toBeNull();
  });
});

// @vitest-environment jsdom
import type { NameSuggestion, TransactionSchema } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  renamed: [] as unknown[],
  named: [] as unknown[],
  updated: [] as unknown[],
  suggestions: [] as NameSuggestion[],
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  renameTransactionV1TransactionsTransactionIdNamePutMutation: () => ({
    mutationFn: async (variables: {
      path: { transaction_id: string };
      body: { name: string | null };
    }) => {
      api.renamed.push({ path: variables.path, body: variables.body });
      return {
        id: variables.path.transaction_id,
        name: variables.body.name,
        suggestions: api.suggestions,
      };
    },
  }),
  nameTransactionsV1TransactionsNamesPostMutation: () => ({
    mutationFn: async (variables: { body: unknown }) => {
      api.named.push(variables.body);
      return { renamed: 3 };
    },
  }),
  updateTransactionV1TransactionsTransactionIdPatchMutation: () => ({
    mutationFn: async (variables: {
      path: { transaction_id: string };
      body: { note: string };
    }) => {
      api.updated.push({ path: variables.path, body: variables.body });
      return {
        id: variables.path.transaction_id,
        note: variables.body.note.trim() || null,
      };
    },
  }),
}));
vi.mock("@/lib/client", () => ({ client: { getConfig: () => ({}) } }));

const { NameHeading, NameSuggestions, NoteField, displayName } = await import(
  "./transaction-naming"
);

function tx(overrides: Partial<TransactionSchema>): TransactionSchema {
  return {
    id: "t1",
    description: "ANTHROPIC* CLAUDE SUB",
    name: null,
    note: null,
    ...overrides,
  } as TransactionSchema;
}

function withQueries(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function heading(transaction: TransactionSchema) {
  const onSuggestions = vi.fn();
  render(
    withQueries(
      <NameHeading
        transaction={transaction}
        onSuggestions={onSuggestions}
        renderTitle={(title) => <h2>{title}</h2>}
      />,
    ),
  );
  return { onSuggestions };
}

beforeEach(() => {
  api.renamed = [];
  api.named = [];
  api.updated = [];
  api.suggestions = [];
});

afterEach(cleanup);

describe("displayName", () => {
  it("prefers the user's name, then the bank's text", () => {
    expect(displayName(tx({ name: "Claude" }))).toBe("Claude");
    expect(displayName(tx({}))).toBe("ANTHROPIC* CLAUDE SUB");
    expect(displayName(tx({ description: null }))).toBe("No description");
  });
});

describe("NameHeading", () => {
  it("renames on Enter, once, and hands over what to suggest next", async () => {
    api.suggestions = [{ description: "CLAUDE.AI SUBSCRIPTION", count: 3 }];
    const { onSuggestions } = heading(tx({}));

    fireEvent.click(
      screen.getByRole("button", { name: "Rename ANTHROPIC* CLAUDE SUB" }),
    );
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    expect(input.value).toBe("ANTHROPIC* CLAUDE SUB");
    fireEvent.change(input, { target: { value: "Claude" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onSuggestions).toHaveBeenCalled());
    expect(api.renamed).toEqual([
      { path: { transaction_id: "t1" }, body: { name: "Claude" } },
    ]);
    expect(onSuggestions).toHaveBeenCalledWith(api.suggestions);
  });

  it("drops the edit on Escape, saves nothing unchanged, and still saves the next rename", async () => {
    heading(tx({ name: "Claude" }));

    fireEvent.click(screen.getByRole("button", { name: "Rename Claude" }));
    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "Something else" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Rename Claude" }));
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.renamed).toEqual([]);
    expect(screen.getByRole("heading").textContent).toBe("Claude");

    fireEvent.click(screen.getByRole("button", { name: "Rename Claude" }));
    const again = screen.getByLabelText("Name");
    fireEvent.change(again, { target: { value: "Claude Max" } });
    fireEvent.keyDown(again, { key: "Enter" });

    await waitFor(() =>
      expect(api.renamed).toEqual([
        { path: { transaction_id: "t1" }, body: { name: "Claude Max" } },
      ]),
    );
  });

  it("saves nothing when the bank's text it starts with is left as it is", async () => {
    heading(tx({}));

    fireEvent.click(
      screen.getByRole("button", { name: "Rename ANTHROPIC* CLAUDE SUB" }),
    );
    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: " ANTHROPIC* CLAUDE SUB " } });
    fireEvent.blur(input);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.renamed).toEqual([]);
  });

  it("shows the bank's text under a name, and goes back to it", async () => {
    heading(tx({ name: "Claude" }));

    expect(screen.getByText(/Bank text: ANTHROPIC\* CLAUDE SUB/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use it" }));

    await waitFor(() =>
      expect(api.renamed).toEqual([
        { path: { transaction_id: "t1" }, body: { name: null } },
      ]),
    );
  });

  it("doesn't show the bank's text when there's no name", () => {
    heading(tx({}));
    expect(screen.queryByText(/Bank text/)).toBeNull();
  });
});

describe("NameSuggestions", () => {
  it("names everything with a suggested bank text and says which one is done", async () => {
    const onDone = vi.fn();
    render(
      withQueries(
        <NameSuggestions
          name="Claude"
          description="ANTHROPIC* CLAUDE SUB"
          suggestions={[
            { description: "ANTHROPIC* CLAUDE SUB", count: 2 },
            { description: "CLAUDE.AI SUBSCRIPTION", count: 3 },
          ]}
          onDone={onDone}
        />,
      ),
    );

    expect(
      screen.getByText("2 more with this bank text, and later ones"),
    ).toBeTruthy();
    expect(screen.getByText("3 transactions, and later ones")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[1]);

    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith("CLAUDE.AI SUBSCRIPTION"),
    );
    expect(api.named).toEqual([
      { description: "CLAUDE.AI SUBSCRIPTION", name: "Claude" },
    ]);
  });

  it("shows nothing without suggestions", () => {
    const { container } = render(
      withQueries(
        <NameSuggestions
          name="Claude"
          description="x"
          suggestions={[]}
          onDone={vi.fn()}
        />,
      ),
    );
    expect(container.textContent).toBe("");
  });
});

describe("NoteField", () => {
  it("saves the note when leaving the field, and only when it changed", async () => {
    render(withQueries(<NoteField transaction={tx({ note: "Old" })} />));
    const field = screen.getByLabelText("Note");

    fireEvent.blur(field);
    fireEvent.change(field, { target: { value: "Max plan for Bessel" } });
    fireEvent.blur(field);

    await waitFor(() => expect(api.updated).toHaveLength(1));
    expect(api.updated).toEqual([
      {
        path: { transaction_id: "t1" },
        body: { note: "Max plan for Bessel" },
      },
    ]);
  });
});

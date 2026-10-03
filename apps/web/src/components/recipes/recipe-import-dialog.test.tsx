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
  calls: [] as unknown[],
  respond: (): Promise<unknown> => Promise.resolve(undefined),
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  structureRecipeTextV1RecipesImportPostMutation: () => ({
    mutationFn: (variables: unknown) => {
      api.calls.push(variables);
      return api.respond();
    },
  }),
}));
vi.mock("@/lib/client", () => ({ client: {} }));

const { RecipeImportDialog, RECIPE_IMPORT_MAX_CHARS } = await import(
  "./recipe-import-dialog"
);

const RESULT = {
  title: "Pannkakor",
  recipe_type: "other",
  body: { ingredient_groups: [], steps: [], sections: [] },
};

function mount() {
  const onImported = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RecipeImportDialog
        open
        onOpenChange={onOpenChange}
        onImported={onImported}
      />
    </QueryClientProvider>,
  );
  const textarea = screen.getByLabelText("Recipe text") as HTMLTextAreaElement;
  const submit = screen.getByRole("button", {
    name: /sort it out/i,
  }) as HTMLButtonElement;
  return { textarea, submit, onImported, onOpenChange };
}

beforeEach(() => {
  api.calls = [];
  api.respond = async () => RESULT;
});
afterEach(cleanup);

describe("RecipeImportDialog", () => {
  it("can't submit until there is text", () => {
    const { textarea, submit } = mount();
    expect(submit.disabled).toBe(true);
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(submit.disabled).toBe(true);
  });

  it("sends the trimmed text and hands the result over", async () => {
    const { textarea, submit, onImported, onOpenChange } = mount();

    fireEvent.change(textarea, { target: { value: "  2 dl mjöl  " } });
    fireEvent.click(submit);

    await waitFor(() => expect(onImported).toHaveBeenCalledWith(RESULT));
    expect(api.calls[0]).toMatchObject({ body: { text: "2 dl mjöl" } });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("submits with Ctrl+Enter", async () => {
    const { textarea, onImported } = mount();

    fireEvent.change(textarea, { target: { value: "2 dl mjöl" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(onImported).toHaveBeenCalled());
  });

  it("explains a failure and keeps the text", async () => {
    api.respond = async () => {
      throw {
        error: "RecipeImportError",
        detail: "This is a shopping list, not a recipe.",
      };
    };
    const { textarea, submit, onImported } = mount();

    fireEvent.change(textarea, { target: { value: "mjölk, bröd" } });
    fireEvent.click(submit);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "This is a shopping list, not a recipe.",
    );
    expect(textarea.value).toBe("mjölk, bröd");
    expect(onImported).not.toHaveBeenCalled();

    fireEvent.change(textarea, { target: { value: "mjölk, bröd, ägg" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("blocks text over the limit", () => {
    const { textarea, submit } = mount();
    fireEvent.change(textarea, {
      target: { value: "x".repeat(RECIPE_IMPORT_MAX_CHARS + 1) },
    });
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/paste just the recipe part/)).toBeTruthy();
  });
});

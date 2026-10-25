// @vitest-environment jsdom
import { listRecipesQueryKey } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  log: vi.fn(),
  remove: vi.fn(),
}));
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
);

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  logRecipeCookedMutation: () => ({ mutationFn: api.log }),
  removeRecipeCookedMutation: () => ({ mutationFn: api.remove }),
}));
vi.mock("sonner", () => ({ toast }));

const { client } = await import("@/lib/client");
const { useRecipeCooks } = await import("./use-recipe-cooks");

const recipe = (cookCount: number) => ({
  id: "r1",
  title: "Dal",
  cook_count: cookCount,
  last_cooked_on: cookCount ? new Date("2026-10-25T00:00:00Z") : null,
});

function mount() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    listRecipesQueryKey({ client, query: { limit: 200 } }),
    {
      items: [recipe(0), { ...recipe(0), id: "r2", title: "Pho" }],
      pagination: { total_count: 2, max_page: 1 },
    },
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useRecipeCooks("2026-10-25"), {
    wrapper,
  });
  return { result, queryClient };
}

beforeEach(() => {
  api.log.mockReset();
  api.remove.mockReset();
  toast.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(cleanup);

describe("useRecipeCooks", () => {
  it("logs the local day and shows the recipe as cooked in the list", async () => {
    api.log.mockResolvedValue({ recipe: recipe(1), created: true });
    const { result, queryClient } = mount();

    act(() => result.current.logCooked({ id: "r1" }, "2026-10-25"));

    await waitFor(() => expect(api.log).toHaveBeenCalledTimes(1));
    const { path } = api.log.mock.calls[0][0];
    expect(path.recipe_id).toBe("r1");
    expect(path.cooked_on.toISOString()).toBe("2026-10-25T00:00:00.000Z");
    await waitFor(() =>
      expect(
        queryClient
          .getQueryData<{ items: { id: string; cook_count: number }[] }>(
            listRecipesQueryKey({ client, query: { limit: 200 } }),
          )
          ?.items.map((r) => [r.id, r.cook_count]),
      ).toEqual([
        ["r1", 1],
        ["r2", 0],
      ]),
    );
  });

  it("offers to undo a day it added, and undoing takes that same day off", async () => {
    api.log.mockResolvedValue({ recipe: recipe(1), created: true });
    api.remove.mockResolvedValue(recipe(0));
    const { result } = mount();

    act(() => result.current.logCooked({ id: "r1" }, "2026-10-25"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    const [message, options] = toast.success.mock.calls[0];
    expect(message).toBe("Logged as cooked today");
    act(() => options.action.onClick());

    await waitFor(() => expect(api.remove).toHaveBeenCalledTimes(1));
    expect(api.remove.mock.calls[0][0].path).toEqual(
      api.log.mock.calls[0][0].path,
    );
  });

  it("doesn't offer an undo for a day that was already logged", async () => {
    api.log.mockResolvedValue({ recipe: recipe(1), created: false });
    const { result } = mount();

    act(() => result.current.logCooked({ id: "r1" }, "2026-10-25"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("Already logged for today"),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("names another day in the message", async () => {
    api.log.mockResolvedValue({ recipe: recipe(1), created: true });
    const { result } = mount();

    act(() => result.current.logCooked({ id: "r1" }, "2026-10-08"));

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.success.mock.calls[0][0]).toBe(
      "Logged as cooked on Thu 8 Oct",
    );
  });
});

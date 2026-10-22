// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useRouteFilters } from "./route-filters";

interface Filters {
  search?: string;
}

function Filtered() {
  const [filters, setFilters] = useRouteFilters<Filters>("/transactions");
  return (
    <button type="button" onClick={() => setFilters({ search: "ICA" })}>
      {filters.search ?? "no search"}
    </button>
  );
}

function mount(path: string) {
  const root = createRootRoute();
  const app = createRoute({ getParentRoute: () => root, id: "_app" });
  const transactions = createRoute({
    getParentRoute: () => app,
    path: "transactions",
    validateSearch: (raw: Record<string, unknown>): Filters => ({
      search: typeof raw.search === "string" ? raw.search : undefined,
    }),
    component: Filtered,
  });
  // A canvas widget shows the page inside another one.
  const canvas = createRoute({
    getParentRoute: () => app,
    path: "canvas",
    component: Filtered,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([transactions, canvas])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(cleanup);

describe("useRouteFilters", () => {
  it("reads and writes the URL on the page's own route", async () => {
    const router = mount("/transactions?search=Hallon");

    const button = await screen.findByText("Hallon");
    await act(async () => fireEvent.click(button));

    expect(await screen.findByText("ICA")).toBeTruthy();
    expect(router.state.location.search).toEqual({ search: "ICA" });
  });

  it("keeps filters to itself when shown inside another page", async () => {
    const router = mount("/canvas");

    const button = await screen.findByText("no search");
    await act(async () => fireEvent.click(button));

    expect(await screen.findByText("ICA")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/canvas");
    expect(router.state.location.search).toEqual({});
  });
});

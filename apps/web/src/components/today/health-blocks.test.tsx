// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const shown = vi.hoisted(() => ({ pages: new Set<string>() }));

vi.mock("@/components/use-page-visibility", () => ({
  usePageVisibility: () => ({
    isVisible: (page: string) => shown.pages.has(page),
    isSettled: () => true,
  }),
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  getDailySleepOptions: () => ({
    queryKey: ["sleep"],
    queryFn: async () => ({ nights: [] }),
  }),
  listActivitySourcesOptions: () => ({
    queryKey: ["sources"],
    queryFn: async () => ({ sources: [] }),
  }),
}));

const { HealthBlocks } = await import("./today-page");

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HealthBlocks now={new Date(2026, 9, 27, 12)} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("HealthBlocks", () => {
  it("shows sleep and screen time side by side when both pages show", () => {
    shown.pages = new Set(["sleep", "activity"]);
    const { container } = mount();

    expect(screen.getByText("Last night")).toBeTruthy();
    expect(screen.getAllByText("Screen time").length).toBeGreaterThan(0);
    expect(container.firstElementChild?.className).toContain("sm:grid-cols-2");
  });

  it("leaves out a card whose page is hidden, and the row when both are", () => {
    shown.pages = new Set(["activity"]);
    const { container } = mount();

    expect(screen.queryByText("Last night")).toBeNull();
    expect(screen.getAllByText("Screen time").length).toBeGreaterThan(0);
    expect(container.firstElementChild?.className).not.toContain(
      "sm:grid-cols-2",
    );
    cleanup();

    shown.pages = new Set();
    expect(mount().container.innerHTML).toBe("");
  });
});

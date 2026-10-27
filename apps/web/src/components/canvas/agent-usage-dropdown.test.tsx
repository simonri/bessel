// @vitest-environment jsdom
import { TooltipProvider } from "@bessel/ui/components/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ desktop: false }));
const usage = vi.hoisted(() => ({
  status: [] as unknown[],
  daily: [] as unknown[],
}));

vi.mock("@/lib/environment", () => ({
  get isDesktop() {
    return env.desktop;
  },
}));
vi.mock("@bessel/client", () => ({
  getAgentUsageStatusOptions: () => ({
    queryKey: ["status"],
    queryFn: async () => ({ entries: usage.status }),
  }),
  getAgentUsageDailyOptions: () => ({
    queryKey: ["daily"],
    queryFn: async () => ({ entries: usage.daily }),
  }),
}));

const { AgentUsageDropdown } = await import("./agent-usage-dropdown");

function renderGauge() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AgentUsageDropdown />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

const settled = (queryClient: QueryClient) =>
  waitFor(() => expect(queryClient.isFetching()).toBe(0));

beforeEach(() => {
  env.desktop = false;
  usage.status = [];
  usage.daily = [];
});
afterEach(cleanup);

describe("AgentUsageDropdown", () => {
  it("isn't in a browser with no usage to show", async () => {
    await settled(renderGauge());

    expect(screen.queryByRole("button", { name: "Agent usage" })).toBeNull();
  });

  it("shows in a browser once there's usage", async () => {
    usage.daily = [
      {
        date: "2026-10-27",
        model: "claude-opus-5-5",
        input_tokens: 1,
        output_tokens: 1,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      },
    ];
    renderGauge();

    expect(
      await screen.findByRole("button", { name: "Agent usage" }),
    ).toBeTruthy();
  });

  it("shows in the desktop app even before any usage", async () => {
    env.desktop = true;
    await settled(renderGauge());

    expect(screen.getByRole("button", { name: "Agent usage" })).toBeTruthy();
  });
});

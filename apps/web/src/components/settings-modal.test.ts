import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/settings-about-page", () => ({ AboutPage: () => null }));
vi.mock("@/components/settings-dashboard-page", () => ({
  DashboardPage: () => null,
}));
vi.mock("@/components/settings-devices-page", () => ({
  DevicesPage: () => null,
}));
vi.mock("@/components/settings-monitor-page", () => ({
  MonitorPage: () => null,
}));
vi.mock("@/components/settings-pages-page", () => ({
  PagesPage: () => null,
}));
vi.mock("@/components/settings-integrations-page", () => ({
  IntegrationsPage: () => null,
}));
vi.mock("@/components/settings-claude-page", () => ({
  ClaudePage: () => null,
}));

const { matchingGroups } = await import("./settings-modal");

const labels = (query: string) =>
  matchingGroups(query).flatMap((group) =>
    group.items.map((item) => item.label),
  );

describe("matchingGroups", () => {
  it("finds a page by its name or by what's on it", () => {
    expect(labels("dash")).toEqual(["Dashboard"]);
    expect(labels("widgets")).toEqual(["Dashboard"]);
    expect(labels("avanza")).toEqual(["Integrations"]);
  });

  it("needs every word to match, in any case", () => {
    expect(labels("GOOGLE calendar")).toEqual(["Integrations"]);
    expect(labels("google widgets")).toEqual([]);
  });

  it("drops groups with nothing left, and shows everything for an empty search", () => {
    expect(matchingGroups("avanza").map((group) => group.label)).toEqual([
      "Connections",
    ]);
    expect(labels("  ")).toEqual([
      "Dashboard",
      "Pages",
      "Integrations",
      "Claude",
    ]);
  });

  it("finds the Claude page by MCP, what it remembers, or the phone", () => {
    expect(labels("mcp")).toEqual(["Claude"]);
    expect(labels("memory")).toEqual(["Claude"]);
    for (const q of ["phone", "remote", "notifications", "claude code"])
      expect(labels(q)).toContain("Claude");
  });

  it("finds the pages switches by a page's name", () => {
    expect(labels("sleep")).toEqual(["Pages"]);
    expect(labels("screen time")).toEqual(["Pages"]);
  });
});

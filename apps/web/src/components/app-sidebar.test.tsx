// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/hooks/use-settings";
import { AppSidebar, loadSidebarWidth } from "./app-sidebar";

const env = vi.hoisted(() => ({ desktop: false }));
vi.mock("@/lib/environment", () => ({
  get isDesktop() {
    return env.desktop;
  },
}));
vi.mock("@/components/canvas/project-sessions", () => ({
  ProjectSessions: () => <p>Code folders</p>,
}));
vi.mock("@/components/use-page-visibility", () => ({
  usePageVisibility: () => ({
    isVisible: (page: string) => page !== "sleep",
    isSettled: () => true,
  }),
}));

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
}

Object.defineProperty(window, "localStorage", {
  value: memoryStorage(),
  configurable: true,
});

beforeEach(() => {
  window.localStorage.clear();
  env.desktop = false;
});
afterEach(cleanup);

describe("loadSidebarWidth", () => {
  it("uses the default width when nothing is stored", () => {
    expect(loadSidebarWidth()).toBe(208);
  });

  it("restores and clamps a stored width", () => {
    window.localStorage.setItem("bessel:sidebarWidth", "300");
    expect(loadSidebarWidth()).toBe(300);
    window.localStorage.setItem("bessel:sidebarWidth", "10");
    expect(loadSidebarWidth()).toBe(180);
  });

  it("ignores garbage", () => {
    window.localStorage.setItem("bessel:sidebarWidth", "wide");
    expect(loadSidebarWidth()).toBe(208);
  });
});

describe("AppSidebar", () => {
  function renderSidebar() {
    render(
      <SettingsProvider>
        <AppSidebar
          activePage="today"
          onSelectPage={() => {}}
          onNewSession={() => {}}
        />
      </SettingsProvider>,
    );
  }

  it("leaves out pages that shouldn't show", () => {
    renderSidebar();
    const pages = screen.getByRole("navigation", { name: "Pages" });

    expect(pages.textContent).toContain("Screen time");
    expect(pages.textContent).toContain("Today");
    expect(pages.textContent).not.toContain("Sleep");
  });

  it("has no code folders in a browser, where they can't open", () => {
    renderSidebar();

    expect(screen.queryByRole("navigation", { name: "Code" })).toBeNull();
    expect(screen.queryByText("Code folders")).toBeNull();
  });

  it("lists code folders in the desktop app", () => {
    env.desktop = true;
    renderSidebar();

    expect(screen.getByText("Code folders")).toBeTruthy();
  });
});

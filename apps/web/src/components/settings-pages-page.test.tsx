// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/hooks/use-settings";
import { PagesPage } from "./settings-pages-page";

vi.mock("@/components/use-page-visibility", () => ({
  usePageVisibility: () => ({
    isVisible: (page: string) => page === "sleep",
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

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const saved = () =>
  JSON.parse(window.localStorage.getItem("bessel:settings") ?? "{}");

describe("PagesPage", () => {
  it("has a switch per optional page showing whether it's in the sidebar", () => {
    render(
      <SettingsProvider>
        <PagesPage />
      </SettingsProvider>,
    );

    const checked = (name: string) =>
      screen.getByRole("switch", { name }).getAttribute("aria-checked");
    expect(checked("Sleep")).toBe("true");
    expect(checked("Screen time")).toBe("false");
    expect(checked("Trading")).toBe("false");
    expect(checked("Investments")).toBe("false");
  });

  it("saves the choice when a switch is flipped", () => {
    render(
      <SettingsProvider>
        <PagesPage />
      </SettingsProvider>,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Screen time" }));
    fireEvent.click(screen.getByRole("switch", { name: "Sleep" }));

    expect(saved().pageChoices).toEqual({ activity: true, sleep: false });
  });
});

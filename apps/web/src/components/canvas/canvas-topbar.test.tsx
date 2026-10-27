// @vitest-environment jsdom
import { TooltipProvider } from "@bessel/ui/components/tooltip";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/hooks/use-settings";
import { CanvasTopBar } from "./canvas-topbar";

vi.mock("./agent-usage-dropdown", () => ({ AgentUsageDropdown: () => null }));
vi.mock("./avatar-menu", () => ({ AvatarMenu: () => null }));
vi.mock("./notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("./time-since-dropdown", () => ({ TimeSinceDropdown: () => null }));
vi.mock("./crypto-pair-ticker", () => ({
  CryptoPairTicker: ({ pair }: { pair: string }) => <span>{pair}</span>,
}));
vi.mock("@/components/settings-dialog", () => ({
  useOpenSettings: () => () => {},
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

function renderBar(onSearch = vi.fn()) {
  render(
    <SettingsProvider>
      <TooltipProvider>
        <CanvasTopBar onSearch={onSearch} />
      </TooltipProvider>
    </SettingsProvider>,
  );
  return onSearch;
}

describe("CanvasTopBar", () => {
  it("opens search from a visible button with its shortcut", () => {
    const onSearch = renderBar();
    const button = screen.getByRole("button", { name: "Search" });

    expect(button.textContent).toMatch(/Ctrl K|⌘K/);
    fireEvent.click(button);
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it("shows no ticker for a new user", () => {
    renderBar();

    expect(screen.queryByText("BTCUSDT")).toBeNull();
  });

  it("keeps the ticker for saved pairs", () => {
    window.localStorage.setItem(
      "bessel:settings",
      JSON.stringify({ cryptoPairs: "btcusdt, ethusdt" }),
    );
    renderBar();

    expect(screen.getByText("BTCUSDT")).toBeTruthy();
    expect(screen.getByText("ETHUSDT")).toBeTruthy();
  });
});

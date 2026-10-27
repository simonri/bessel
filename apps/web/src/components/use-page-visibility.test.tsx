// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageKey } from "@/components/pages";
import { SettingsProvider, useSettings } from "@/hooks/use-settings";

const api = vi.hoisted(() => ({
  accounts: [] as { subtype: string }[],
  sleep: [] as unknown[],
  sources: [] as string[],
  failSleep: false,
  fetched: [] as string[],
}));

vi.mock("@bessel/client", () => ({
  listBankAccountsOptions: () => ({
    queryKey: ["accounts"],
    queryFn: async () => {
      api.fetched.push("accounts");
      return { items: api.accounts };
    },
  }),
  listHealthkitSleepOptions: () => ({
    queryKey: ["sleep"],
    queryFn: async () => {
      api.fetched.push("sleep");
      if (api.failSleep) throw new Error("down");
      return { items: api.sleep };
    },
  }),
  listActivitySourcesOptions: () => ({
    queryKey: ["sources"],
    queryFn: async () => {
      api.fetched.push("sources");
      return { sources: api.sources };
    },
  }),
}));
vi.mock("@/components/pages", () => ({
  isOptionalPage: (page: string) =>
    ["hyperliquid", "investments", "sleep", "activity", "canvas"].includes(
      page,
    ),
}));

const boards = vi.hoisted(() => ({ windows: new Map<string, unknown[]>() }));
vi.mock("@/components/canvas/window-manager", () => ({
  useWindowState: () => ({ windowsByWorkspace: boards.windows }),
}));

const { usePageVisibility, useHiddenPageFallback } = await import(
  "./use-page-visibility"
);

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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>{children}</SettingsProvider>
    </QueryClientProvider>
  );
}

function visibility() {
  return renderHook(() => ({ ...usePageVisibility(), ...useSettings() }), {
    wrapper,
  });
}

const OPTIONAL: PageKey[] = [
  "hyperliquid",
  "investments",
  "sleep",
  "activity",
  "canvas",
];

beforeEach(() => {
  window.localStorage.clear();
  api.accounts = [];
  api.sleep = [];
  api.sources = [];
  api.failSleep = false;
  api.fetched = [];
  boards.windows = new Map([["a", []]]);
});
afterEach(() => vi.clearAllMocks());

describe("optional pages for a new user", () => {
  it("are hidden when the account has nothing for them", async () => {
    const { result } = visibility();
    await waitFor(() =>
      expect(OPTIONAL.every((p) => result.current.isSettled(p))).toBe(true),
    );

    for (const page of OPTIONAL)
      expect(result.current.isVisible(page)).toBe(false);
    expect(result.current.isVisible("today")).toBe(true);
    expect(result.current.isVisible("transactions")).toBe(true);
  });

  it("show once the account has their data", async () => {
    api.accounts = [{ subtype: "checking" }, { subtype: "isk" }];
    api.sleep = [{ id: "night" }];
    api.sources = ["laptop"];
    window.localStorage.setItem(
      "bessel:settings",
      JSON.stringify({
        hyperliquidAddress: "0xabc",
        pageChoices: {},
        showOptionalPages: false,
      }),
    );
    const { result } = visibility();

    await waitFor(() => expect(result.current.isVisible("sleep")).toBe(true));
    await waitFor(() =>
      expect(result.current.isVisible("investments")).toBe(true),
    );
    expect(result.current.isVisible("activity")).toBe(true);
    expect(result.current.isVisible("hyperliquid")).toBe(true);
  });

  it("show the canvas once a board has a widget on it", () => {
    boards.windows = new Map([
      ["a", []],
      ["b", [{ id: "w1" }]],
    ]);
    const { result } = visibility();

    expect(result.current.isSettled("canvas")).toBe(true);
    expect(result.current.isVisible("canvas")).toBe(true);
  });

  it("don't count everyday accounts as investments", async () => {
    api.accounts = [{ subtype: "checking" }, { subtype: "savings" }];
    const { result } = visibility();
    await waitFor(() =>
      expect(result.current.isSettled("investments")).toBe(true),
    );

    expect(result.current.isVisible("investments")).toBe(false);
  });

  it("aren't settled until their data is known", () => {
    const { result } = visibility();

    expect(result.current.isSettled("sleep")).toBe(false);
    expect(result.current.isSettled("hyperliquid")).toBe(true);
    expect(result.current.isSettled("today")).toBe(true);
  });

  it("stay hidden when their data can't be loaded", async () => {
    api.failSleep = true;
    const { result } = visibility();
    await waitFor(() => expect(result.current.isSettled("sleep")).toBe(true));

    expect(result.current.isVisible("sleep")).toBe(false);
  });

  it("follow what someone turned on or off, whatever the data", async () => {
    api.sleep = [{ id: "night" }];
    const { result } = visibility();
    act(() =>
      result.current.update({
        pageChoices: { sleep: false, hyperliquid: true },
      }),
    );

    await waitFor(() =>
      expect(result.current.isSettled("activity")).toBe(true),
    );
    expect(result.current.isVisible("sleep")).toBe(false);
    expect(result.current.isVisible("hyperliquid")).toBe(true);
  });

  it("stay opt-in after the new user's settings are saved", async () => {
    const first = visibility();
    act(() => first.result.current.update({ navOrder: ["tasks"] }));
    first.unmount();

    const { result } = visibility();
    await waitFor(() => expect(result.current.isSettled("sleep")).toBe(true));

    expect(result.current.isVisible("sleep")).toBe(false);
  });
});

describe("optional pages for settings saved before they were opt-in", () => {
  beforeEach(() =>
    window.localStorage.setItem(
      "bessel:settings",
      JSON.stringify({ cryptoPairs: "BTCUSDT", navOrder: [] }),
    ),
  );

  it("all show, without asking the API", () => {
    const { result } = visibility();

    for (const page of OPTIONAL) {
      expect(result.current.isSettled(page)).toBe(true);
      expect(result.current.isVisible(page)).toBe(true);
    }
    expect(api.fetched).toEqual([]);
  });

  it("can still be turned off", () => {
    const { result } = visibility();
    act(() => result.current.update({ pageChoices: { activity: false } }));

    expect(result.current.isVisible("activity")).toBe(false);
    expect(result.current.isVisible("sleep")).toBe(true);
  });
});

describe("useHiddenPageFallback", () => {
  function fallback(initial: PageKey) {
    const goTo = vi.fn();
    const hook = renderHook(
      ({ page }) => {
        useHiddenPageFallback(page, goTo);
        return useSettings();
      },
      { wrapper, initialProps: { page: initial } },
    );
    return { ...hook, goTo };
  }

  it("leaves a restored page that turns out hidden for Today", async () => {
    const { goTo } = fallback("sleep");

    await waitFor(() => expect(goTo).toHaveBeenCalledWith("today"));
  });

  it("stays on a restored page that has data", async () => {
    api.sleep = [{ id: "night" }];
    const { goTo } = fallback("sleep");

    await waitFor(() => expect(api.fetched).toContain("sleep"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(goTo).not.toHaveBeenCalled();
  });

  it("stays on a hidden page someone opened on purpose", async () => {
    const { rerender, goTo } = fallback("today");
    rerender({ page: "sleep" });

    await waitFor(() => expect(api.fetched).toContain("sleep"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(goTo).not.toHaveBeenCalled();
  });

  it("leaves the open page when someone turns it off", () => {
    window.localStorage.setItem(
      "bessel:settings",
      JSON.stringify({ navOrder: [] }),
    );
    const { result, goTo } = fallback("activity");
    expect(goTo).not.toHaveBeenCalled();

    act(() => result.current.update({ pageChoices: { activity: false } }));

    expect(goTo).toHaveBeenCalledWith("today");
  });
});

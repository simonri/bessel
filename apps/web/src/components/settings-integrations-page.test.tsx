// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  accounts: [] as unknown[],
  sources: [] as unknown[],
  banks: {
    available: true,
    banks: [],
    bank_options: [],
    connections: [] as unknown[],
  },
  avanza: { available: true, connection: null as unknown },
  montrose: { logo: "", connection: null as unknown },
  settings: {
    hyperliquidAddress: null as string | null,
    obsidianVaultPath: null,
  },
  actions: {
    connectGoogle: vi.fn(),
    connectICloud: vi.fn(),
    syncAccount: vi.fn(),
    disconnectAccount: vi.fn(),
    setCalendarHidden: vi.fn(),
  },
  allowEditing: vi.fn(),
  update: vi.fn(),
  openPage: vi.fn(),
  close: vi.fn(),
  openSettings: vi.fn(),
  requestAddAccount: vi.fn(),
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listBankConnectionsOptions: () => ({
    queryKey: ["banks"],
    queryFn: async () => state.banks,
  }),
  getAvanzaOptions: () => ({
    queryKey: ["avanza"],
    queryFn: async () => state.avanza,
  }),
  getMontroseOptions: () => ({
    queryKey: ["montrose"],
    queryFn: async () => state.montrose,
  }),
  getLocationHistorySummaryOptions: () => ({
    queryKey: ["timeline"],
    queryFn: async () => ({ days: [], last_import: null, place_names: false }),
  }),
  listActivitySourcesOptions: () => ({
    queryKey: ["activity"],
    queryFn: async () => ({ sources: [] }),
  }),
}));
vi.mock("@/components/calendar/use-calendar-data", () => ({
  useCalendarAccounts: () => ({ accounts: state.accounts, isLoading: false }),
  useCalendarActions: () => state.actions,
}));
vi.mock("@/components/contacts/use-contacts", () => ({
  useContactSources: () => ({
    sources: state.sources,
    allowEditing: state.allowEditing,
  }),
}));
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ settings: state.settings, update: state.update }),
}));
vi.mock("@/components/open-page-context", () => ({
  useOpenPage: () => state.openPage,
}));
vi.mock("@/components/settings-dialog", () => ({
  useCloseSettings: () => state.close,
  useOpenSettings: () => state.openSettings,
}));
vi.mock("@/components/accounts/account-actions", () => ({
  requestAddAccount: state.requestAddAccount,
}));

const { IntegrationsPage } = await import("./settings-integrations-page");

const account = (
  id: string,
  provider: "google" | "icloud",
  email: string,
  extra = {},
) => ({
  id,
  provider,
  email,
  lastSyncedAt: new Date(),
  syncError: null,
  canWrite: true,
  canReadPeople: provider === "google",
  ...extra,
});

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <IntegrationsPage />
    </QueryClientProvider>,
  );
}

function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest("div.flex.items-center");
  if (!row) throw new Error(`no row for ${text}`);
  return row as HTMLElement;
}

/** Opens an account's "…" menu and picks an item from it. */
function choose(email: string, item: string) {
  fireEvent.pointerDown(
    screen.getByRole("button", { name: `Manage ${email}` }),
    { button: 0, ctrlKey: false },
  );
  fireEvent.click(
    within(screen.getByRole("menu")).getByRole("menuitem", { name: item }),
  );
}

function menuItems(email: string): string[] {
  fireEvent.pointerDown(
    screen.getByRole("button", { name: `Manage ${email}` }),
    { button: 0, ctrlKey: false },
  );
  const items = within(screen.getByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent ?? "");
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  return items;
}

beforeEach(() => {
  for (const fn of [
    ...Object.values(state.actions),
    state.allowEditing,
    state.update,
    state.openPage,
    state.close,
    state.openSettings,
    state.requestAddAccount,
  ])
    fn.mockReset();
  state.accounts = [];
  state.sources = [];
  state.banks = {
    available: true,
    banks: [],
    bank_options: [],
    connections: [],
  };
  state.avanza = { available: true, connection: null };
  state.montrose = { logo: "", connection: null };
  state.settings = { hyperliquidAddress: null, obsidianVaultPath: null };
});
afterEach(cleanup);

describe("IntegrationsPage", () => {
  it("reconnects each calendar account the way its provider signs in", () => {
    state.accounts = [
      account("g", "google", "me@gmail.com"),
      account("i", "icloud", "me@icloud.com"),
    ];
    mount();

    choose("me@gmail.com", "Reconnect");
    expect(state.actions.connectGoogle).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Connect iCloud Calendar")).toBeNull();

    choose("me@icloud.com", "Reconnect");
    expect(state.actions.connectGoogle).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Connect iCloud Calendar")).toBeTruthy();
  });

  it("says what each account brings and how its sync went", () => {
    state.accounts = [
      account("g", "google", "me@gmail.com"),
      account("w", "google", "work@gmail.com", {
        canReadPeople: false,
        syncError: "Google said no",
      }),
      account("i", "icloud", "me@icloud.com"),
    ];
    mount();

    expect(
      within(rowOf("me@gmail.com")).getByText(
        "Calendar and contacts, from Google",
      ),
    ).toBeTruthy();
    expect(
      within(rowOf("work@gmail.com")).getByText("Calendar, from Google"),
    ).toBeTruthy();
    expect(
      within(rowOf("work@gmail.com")).getByText("Google said no"),
    ).toBeTruthy();
    expect(
      within(rowOf("me@icloud.com")).getByText("Calendar, from iCloud"),
    ).toBeTruthy();
  });

  it("syncs an account from its menu", () => {
    state.accounts = [account("g", "google", "me@gmail.com")];
    mount();

    choose("me@gmail.com", "Sync now");

    expect(state.actions.syncAccount).toHaveBeenCalledWith("g");
  });

  it("asks before disconnecting, then disconnects that account", async () => {
    state.accounts = [account("g", "google", "me@gmail.com")];
    mount();

    choose("me@gmail.com", "Disconnect");
    expect(state.actions.disconnectAccount).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    expect(state.actions.disconnectAccount).toHaveBeenCalledWith("g");
  });

  it("offers to allow contact editing only where Google doesn't allow it yet", () => {
    state.accounts = [
      account("g", "google", "me@gmail.com"),
      account("w", "google", "work@gmail.com"),
    ];
    state.sources = [
      { id: "s1", email: "me@gmail.com", can_edit: false },
      { id: "s2", email: "work@gmail.com", can_edit: true },
    ];
    mount();

    expect(menuItems("work@gmail.com")).not.toContain("Allow editing contacts");
    choose("me@gmail.com", "Allow editing contacts");
    expect(state.allowEditing).toHaveBeenCalledWith("s1");
  });

  it("adds money accounts on Accounts, with its add dialog asked for", async () => {
    mount();

    const money = (
      await screen.findByText(/Banks, Avanza, Montrose and Klarna/)
    ).closest("section") as HTMLElement;
    fireEvent.click(
      within(money).getByRole("button", { name: "Bank or broker" }),
    );

    expect(state.close).toHaveBeenCalled();
    expect(state.openPage).toHaveBeenCalledWith("accounts");
    expect(state.requestAddAccount).toHaveBeenCalledTimes(1);
  });

  it("flags a bank whose approval has run out", async () => {
    state.banks.connections = [
      {
        id: "b1",
        bank_name: "Handelsbanken",
        valid_until: new Date(Date.now() - 86_400_000),
        last_synced_at: new Date(),
        sync_error: null,
        accounts: [{}],
      },
      {
        id: "b2",
        bank_name: "Skandia",
        valid_until: new Date(Date.now() + 86_400_000),
        last_synced_at: new Date(),
        sync_error: null,
        accounts: [{}, {}],
      },
    ];
    mount();

    expect(await screen.findByText(/Approval has run out/)).toBeTruthy();
    expect(
      within(rowOf("Skandia")).queryByText(/Approval has run out/),
    ).toBeNull();
    expect(within(rowOf("Skandia")).getByText(/2 accounts/)).toBeTruthy();
  });

  it("saves a Hyperliquid address and refuses something that isn't one", () => {
    mount();
    const input = screen.getByLabelText("Hyperliquid wallet address");

    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(state.update).not.toHaveBeenCalled();
    expect(screen.getByText(/isn't a wallet address/)).toBeTruthy();

    const address = `0x${"ab".repeat(20)}`;
    fireEvent.change(input, { target: { value: address } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(state.update).toHaveBeenCalledWith({ hyperliquidAddress: address });
  });

  it("removes a saved Hyperliquid address", async () => {
    state.settings.hyperliquidAddress = `0x${"cd".repeat(20)}`;
    mount();

    fireEvent.click(
      within(rowOf("Hyperliquid")).getByRole("button", { name: "Remove" }),
    );

    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith({ hyperliquidAddress: null }),
    );
  });
});

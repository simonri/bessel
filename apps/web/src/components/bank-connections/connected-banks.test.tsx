// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  authorize: vi.fn(),
  link: vi.fn(),
  sync: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listBankConnectionsV1BankConnectionsGetOptions: () => ({
    queryKey: ["bank-connections"],
    queryFn: api.list,
  }),
  listBankAccountsV1BankAccountsGetOptions: () => ({
    queryKey: ["bank-accounts"],
    queryFn: async () => ({
      items: [
        { id: "ba-1", name: "Skandia checking", currency: "SEK" },
        { id: "ba-2", name: "Revolut EUR", currency: "EUR" },
      ],
    }),
  }),
  authorizeBankConnectionV1BankConnectionsAuthorizePostMutation: () => ({
    mutationFn: api.authorize,
  }),
  linkBankConnectionAccountV1BankConnectionsAccountsAccountIdPatchMutation:
    () => ({ mutationFn: api.link }),
  syncBankConnectionV1BankConnectionsConnectionIdSyncPostMutation: () => ({
    mutationFn: api.sync,
  }),
  disconnectBankConnectionV1BankConnectionsConnectionIdDeleteMutation: () => ({
    mutationFn: api.disconnect,
  }),
}));

const { ConnectedBanks } = await import("./connected-banks");

const CONNECTION = {
  id: "c1",
  bank_name: "Skandia",
  valid_until: "2027-04-19T12:00:00Z",
  last_synced_at: null,
  sync_error: null,
  accounts: [
    {
      id: "acc-1",
      name: "Allkonto",
      iban: "SE4591500000000000001234",
      currency: "SEK",
      bank_account_id: null,
      import_from: null,
      shared: true,
    },
  ],
};

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConnectedBanks />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.authorize.mockResolvedValue({ url: "https://bank.example/approve" });
  api.link.mockResolvedValue(CONNECTION);
  api.sync.mockResolvedValue(null);
});
afterEach(cleanup);

describe("ConnectedBanks", () => {
  it("shows nothing to users who can't connect a bank", async () => {
    api.list.mockResolvedValue({
      available: false,
      banks: ["Skandia"],
      connections: [],
    });

    mount();

    await waitFor(() => expect(api.list).toHaveBeenCalled());
    await expect(
      screen.findByText("Connected banks", {}, { timeout: 300 }),
    ).rejects.toThrow();
  });

  it("starts the approval with the configured bank from the connect button", async () => {
    api.list.mockResolvedValue({
      available: true,
      banks: ["Mock ASPSP"],
      connections: [],
    });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    mount();
    fireEvent.click(await screen.findByText("Connect Mock ASPSP"));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://bank.example/approve"),
    );
    expect(api.authorize.mock.calls[0][0].body).toEqual({
      bank_name: "Mock ASPSP",
    });
    vi.unstubAllGlobals();
  });

  it("offers the banks not yet connected and renews each with its own bank", async () => {
    api.list.mockResolvedValue({
      available: true,
      banks: ["Klarna", "Skandia"],
      connections: [CONNECTION],
    });
    vi.stubGlobal("location", { ...window.location, assign: vi.fn() });

    mount();
    fireEvent.click(await screen.findByText("Renew"));
    fireEvent.click(screen.getByText("Connect Klarna"));

    await waitFor(() => expect(api.authorize).toHaveBeenCalledTimes(2));
    expect(api.authorize.mock.calls.map((call) => call[0].body)).toEqual([
      { bank_name: "Skandia" },
      { bank_name: "Klarna" },
    ]);
    expect(screen.queryByText("Connect Skandia")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("shows how far the approval runs and what each account imports into", async () => {
    api.list.mockResolvedValue({
      available: true,
      banks: ["Skandia"],
      connections: [
        {
          ...CONNECTION,
          sync_error:
            "Skandia's approval has ended. Renew it to keep importing.",
          accounts: [
            {
              ...CONNECTION.accounts[0],
              bank_account_id: "ba-1",
              import_from: "2026-10-15",
            },
          ],
        },
      ],
    });

    mount();

    expect(
      await screen.findByText(/Skandia's approval has ended/),
    ).toBeTruthy();
    expect(screen.getByText(/approved until 19 Apr 2027/)).toBeTruthy();
    expect(
      screen.getByText("Ending 1234 - importing from 15 Oct 2026"),
    ).toBeTruthy();
    expect(screen.queryByText("Connect Skandia")).toBeNull();
  });

  it("links an account to a Bessel account of the same currency", async () => {
    api.list.mockResolvedValue({
      available: true,
      banks: ["Skandia"],
      connections: [CONNECTION],
    });

    mount();
    const select = (await screen.findByLabelText(
      "Import Allkonto into",
    )) as HTMLSelectElement;
    await screen.findByText("Skandia checking");

    expect([...select.options].map((o) => o.text)).toEqual([
      "Don't import",
      "Skandia checking",
    ]);
    fireEvent.change(select, { target: { value: "ba-1" } });

    await waitFor(() => expect(api.link).toHaveBeenCalledTimes(1));
    expect(api.link.mock.calls[0][0]).toMatchObject({
      path: { account_id: "acc-1" },
      body: { bank_account_id: "ba-1" },
    });

    fireEvent.change(select, { target: { value: "none" } });
    await waitFor(() => expect(api.link).toHaveBeenCalledTimes(2));
    expect(api.link.mock.calls[1][0].body).toEqual({ bank_account_id: null });
  });

  it("says when the latest approval left an account out", async () => {
    api.list.mockResolvedValue({
      available: true,
      banks: ["Skandia"],
      connections: [
        {
          ...CONNECTION,
          accounts: [{ ...CONNECTION.accounts[0], shared: false }],
        },
      ],
    });

    mount();

    expect(
      await screen.findByText(
        "Ending 1234 - left out of the latest approval, renew to include it",
      ),
    ).toBeTruthy();
  });

  it("names an account after its bank when the bank gives it no name", async () => {
    api.list.mockResolvedValue({
      available: true,
      banks: ["Klarna"],
      connections: [
        {
          ...CONNECTION,
          bank_name: "Klarna",
          accounts: [{ ...CONNECTION.accounts[0], name: null }],
        },
      ],
    });

    mount();

    expect(await screen.findByLabelText("Import Klarna into")).toBeTruthy();
  });

  it("syncs on request", async () => {
    api.list.mockResolvedValue({
      available: true,
      banks: ["Skandia"],
      connections: [CONNECTION],
    });

    mount();
    fireEvent.click(await screen.findByText("Sync now"));

    await waitFor(() => expect(api.sync).toHaveBeenCalledTimes(1));
    expect(api.sync.mock.calls[0][0].path).toEqual({ connection_id: "c1" });
  });
});

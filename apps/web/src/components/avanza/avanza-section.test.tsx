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
  get: vi.fn(),
  connect: vi.fn(),
  link: vi.fn(),
  sync: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  getAvanzaV1AvanzaGetOptions: () => ({
    queryKey: ["avanza"],
    queryFn: api.get,
  }),
  listBankAccountsV1BankAccountsGetOptions: () => ({
    queryKey: ["bank-accounts"],
    queryFn: async () => ({
      items: [
        {
          id: "ba-1",
          name: "Avanza ISK",
          currency: "SEK",
          current_balance: 25050,
        },
        {
          id: "ba-2",
          name: "Revolut EUR",
          currency: "EUR",
          current_balance: 0,
        },
      ],
    }),
  }),
  connectAvanzaV1AvanzaConnectPostMutation: () => ({ mutationFn: api.connect }),
  linkAvanzaAccountV1AvanzaAccountsAccountIdPatchMutation: () => ({
    mutationFn: api.link,
  }),
  syncAvanzaV1AvanzaSyncPostMutation: () => ({ mutationFn: api.sync }),
  disconnectAvanzaV1AvanzaDeleteMutation: () => ({
    mutationFn: api.disconnect,
  }),
}));

const { AvanzaSection } = await import("./avanza-section");

const ACCOUNT = {
  id: "av-1",
  name: "Långsiktigt",
  account_type: "INVESTERINGSSPARKONTO",
  bank_account_id: null,
  cash_balance: 25050,
  last_synced_at: null,
};
const CONNECTION = {
  id: "c1",
  username: "simon",
  credentials_rejected: false,
  last_synced_at: null,
  sync_error: null,
  accounts: [ACCOUNT],
};

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AvanzaSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.connect.mockResolvedValue(CONNECTION);
  api.link.mockResolvedValue(CONNECTION);
  api.sync.mockResolvedValue(null);
});
afterEach(cleanup);

describe("AvanzaSection", () => {
  it("shows nothing to users who can't connect Avanza", async () => {
    api.get.mockResolvedValue({ available: false, connection: null });

    mount();

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await expect(
      screen.findByText("Avanza", {}, { timeout: 300 }),
    ).rejects.toThrow();
  });

  it("sends the login from the connect form and shows Avanza's answer", async () => {
    api.get.mockResolvedValue({ available: true, connection: null });
    api.connect.mockRejectedValueOnce({
      detail: "Avanza didn't accept the username or password.",
    });

    mount();
    fireEvent.click(await screen.findByText("Connect Avanza"));
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: " simon " },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "hunter2" },
    });
    fireEvent.change(screen.getByLabelText("TOTP secret"), {
      target: { value: "jbsw y3dp " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText("Avanza didn't accept the username or password."),
    ).toBeTruthy();
    expect(api.connect.mock.calls[0][0].body).toEqual({
      username: "simon",
      password: "hunter2",
      totp_secret: "jbsw y3dp",
    });
  });

  it("names each account's type and flags when Bessel's balance differs from Avanza's cash", async () => {
    api.get.mockResolvedValue({
      available: true,
      connection: {
        ...CONNECTION,
        accounts: [
          { ...ACCOUNT, bank_account_id: "ba-1", last_synced_at: new Date() },
          {
            ...ACCOUNT,
            id: "av-2",
            name: "Pension",
            account_type: "KAPITALFORSAKRING",
            bank_account_id: "ba-1",
            cash_balance: 100,
            last_synced_at: new Date(),
          },
        ],
      },
    });

    mount();

    expect(await screen.findByText("Långsiktigt (ISK)")).toBeTruthy();
    await screen.findAllByText("Avanza ISK");
    expect(screen.getByText("Pension (KF)")).toBeTruthy();
    expect(screen.getByText(/^250,50 SEK cash$/)).toBeTruthy();
    expect(
      screen.getByText("1,00 SEK cash - Bessel shows 250,50 SEK"),
    ).toBeTruthy();
  });

  it("links an account to a SEK Bessel account and stops when set to don't import", async () => {
    api.get.mockResolvedValue({ available: true, connection: CONNECTION });

    mount();
    const select = (await screen.findByLabelText(
      "Import Långsiktigt into",
    )) as HTMLSelectElement;
    await screen.findByText("Avanza ISK");

    expect([...select.options].map((o) => o.text)).toEqual([
      "Don't import",
      "Avanza ISK",
    ]);
    fireEvent.change(select, { target: { value: "ba-1" } });
    await waitFor(() => expect(api.link).toHaveBeenCalledTimes(1));
    expect(api.link.mock.calls[0][0]).toMatchObject({
      path: { account_id: "av-1" },
      body: { bank_account_id: "ba-1" },
    });

    fireEvent.change(select, { target: { value: "none" } });
    await waitFor(() => expect(api.link).toHaveBeenCalledTimes(2));
    expect(api.link.mock.calls[1][0].body).toEqual({ bank_account_id: null });
  });

  it("can't sync while Avanza rejects the login", async () => {
    api.get.mockResolvedValue({
      available: true,
      connection: {
        ...CONNECTION,
        credentials_rejected: true,
        sync_error:
          "Avanza didn't accept the login. Save new credentials to resume syncing.",
      },
    });

    mount();

    expect(await screen.findByText(/didn't accept the login/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Sync now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

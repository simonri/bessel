// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const create = vi.fn(async ({ body }: { body: { name: string } }) => ({
  id: `new-${body.name}`,
  name: body.name,
}));
const linkBank = vi.fn(
  async (_: {
    path: { account_id: string };
    body: { bank_account_id: string };
  }) => ({}),
);

const linkMontrose = vi.fn(
  async (_: {
    path: { account_id: string };
    body: { bank_account_id: string };
  }) => ({}),
);
const connectMontrose = vi.fn();
const montrose = vi.hoisted(() => ({
  status: { logo: "https://logo.example/montrose.png", connection: null } as {
    logo: string;
    connection: unknown;
  },
  fetched: 0,
  async fetch() {
    this.fetched += 1;
    return this.status;
  },
}));

function query(key: string, data: unknown) {
  return () => ({ queryKey: [key], queryFn: async () => data });
}

vi.mock("@bessel/client", () => ({
  listBankConnectionsV1BankConnectionsGetOptions: query("connections", {
    available: true,
    bank_options: [],
    connections: [
      {
        id: "c1",
        bank_name: "Skandia",
        accounts: [
          {
            id: "x1",
            name: "Allkonto",
            iban: "SE001234",
            currency: "SEK",
            shared: true,
            bank_account_id: null,
          },
          {
            id: "x2",
            name: "Sparkonto",
            iban: null,
            currency: "SEK",
            shared: true,
            bank_account_id: null,
          },
          {
            id: "x3",
            name: "Kapitalkonto",
            iban: null,
            currency: "SEK",
            shared: true,
            bank_account_id: null,
          },
          {
            id: "x4",
            name: "Already in",
            iban: null,
            currency: "SEK",
            shared: true,
            bank_account_id: "b9",
          },
        ],
      },
    ],
  }),
  getAvanzaV1AvanzaGetOptions: query("avanza", {
    available: false,
    connection: null,
  }),
  getMontroseV1MontroseGetOptions: () => ({
    queryKey: ["montrose"],
    queryFn: () => montrose.fetch(),
  }),
  linkMontroseAccountV1MontroseAccountsAccountIdPatchMutation: () => ({
    mutationFn: linkMontrose,
  }),
  getMontroseV1MontroseGetQueryKey: () => ["montrose"],
  listBankAccountsV1BankAccountsGetOptions: query("accounts", {
    items: [{ id: "b1", name: "Buffert", currency: "SEK" }],
  }),
  createBankAccountV1BankAccountsPostMutation: () => ({ mutationFn: create }),
  linkBankConnectionAccountV1BankConnectionsAccountsAccountIdPatchMutation:
    () => ({ mutationFn: linkBank }),
  linkAvanzaAccountV1AvanzaAccountsAccountIdPatchMutation: () => ({
    mutationFn: vi.fn(),
  }),
  getAccountsOverviewV1BankAccountsOverviewGetQueryKey: () => ["overview"],
  getNetWorthHistoryV1BankAccountsNetWorthGetQueryKey: () => ["net-worth"],
  listBankAccountsV1BankAccountsGetQueryKey: () => ["accounts"],
  listBankConnectionsV1BankConnectionsGetQueryKey: () => ["connections"],
  getAvanzaV1AvanzaGetQueryKey: () => ["avanza"],
}));
vi.mock("@/components/accounts/account-actions", () => ({
  useAccountActions: () => ({
    upload: vi.fn(),
    connectBank: vi.fn(),
    connectAvanza: vi.fn(),
    connectMontrose,
    busy: false,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { AddAccountDialog } = await import("./add-account-dialog");

afterEach(() => {
  cleanup();
  create.mockClear();
  linkBank.mockClear();
  linkMontrose.mockClear();
  connectMontrose.mockClear();
  montrose.status = {
    logo: "https://logo.example/montrose.png",
    connection: null,
  };
});

function mount(state: Parameters<typeof AddAccountDialog>[0]["state"]) {
  const onStateChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddAccountDialog state={state} onStateChange={onStateChange} />
    </QueryClientProvider>,
  );
  return onStateChange;
}

describe("Montrose", () => {
  it("is offered until it's connected, and goes to its BankID login", async () => {
    const onStateChange = mount({ step: "choose" });

    const tile = await screen.findByRole("button", { name: /Montrose/ });
    expect(tile.querySelector("img")?.getAttribute("src")).toBe(
      "/brands/montrose.png",
    );
    fireEvent.click(tile);
    const [next] = onStateChange.mock.calls.at(-1) ?? [];
    expect(next).toMatchObject({
      step: "safety",
      provider: { kind: "montrose" },
    });
    cleanup();

    mount(next);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to Montrose" }),
    );
    expect(connectMontrose).toHaveBeenCalledOnce();
    cleanup();

    montrose.status = { ...montrose.status, connection: { accounts: [] } };
    const before = montrose.fetched;
    mount({ step: "choose" });
    await waitFor(() => expect(montrose.fetched).toBeGreaterThan(before));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("button", { name: /Klarna/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Montrose/ })).toBeNull();
  });

  it("brings its accounts in by type, into new or existing accounts", async () => {
    montrose.status = {
      ...montrose.status,
      connection: {
        accounts: [
          {
            id: "m1",
            name: "Mitt ISK",
            account_number: "1234-567",
            account_type: "ISK",
            bank_account_id: null,
          },
          {
            id: "m2",
            name: "Pension",
            account_number: "7654-321",
            account_type: "KF",
            bank_account_id: null,
          },
          {
            id: "m3",
            name: "Depå",
            account_number: "1111-222",
            account_type: "Depot",
            bank_account_id: null,
          },
          {
            id: "m4",
            name: "Linked",
            account_number: "9",
            account_type: "ISK",
            bank_account_id: "b8",
          },
        ],
      },
    };
    const onStateChange = mount({ step: "pick", source: "montrose" });

    await screen.findByText("Mitt ISK");
    expect(screen.getByText("1234-567")).toBeTruthy();
    expect(screen.queryByText("Linked")).toBeNull();
    fireEvent.change(screen.getByLabelText("What to do with Pension"), {
      target: { value: "b1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add 3 accounts" }));

    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith(null));
    expect(create.mock.calls.map(([v]) => v.body)).toEqual([
      { name: "Mitt ISK", currency: "SEK", subtype: "isk" },
      { name: "Depå", currency: "SEK", subtype: "brokerage" },
    ]);
    expect(
      linkMontrose.mock.calls.map(([v]) => [
        v.path.account_id,
        v.body.bank_account_id,
      ]),
    ).toEqual([
      ["m1", "new-Mitt ISK"],
      ["m2", "b1"],
      ["m3", "new-Depå"],
    ]);
    expect(linkBank).not.toHaveBeenCalled();
  });
});

describe("choosing accounts after approving a bank", () => {
  it("adds new ones, brings one into an existing account and skips the rest", async () => {
    const onStateChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddAccountDialog
          state={{ step: "pick", source: "bank", bankName: "Skandia" }}
          onStateChange={onStateChange}
        />
      </QueryClientProvider>,
    );

    await screen.findByText("Allkonto");
    expect(screen.queryByText("Already in")).toBeNull();
    fireEvent.change(screen.getByLabelText("What to do with Sparkonto"), {
      target: { value: "b1" },
    });
    fireEvent.change(screen.getByLabelText("What to do with Kapitalkonto"), {
      target: { value: "skip" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add 2 accounts" }));

    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith(null));
    expect(create.mock.calls.map(([v]) => v.body)).toEqual([
      { name: "Allkonto", currency: "SEK", subtype: "checking" },
    ]);
    expect(
      linkBank.mock.calls.map(([v]) => [
        v.path.account_id,
        v.body.bank_account_id,
      ]),
    ).toEqual([
      ["x1", "new-Allkonto"],
      ["x2", "b1"],
    ]);
  });
});

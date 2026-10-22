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

function query(key: string, data: unknown) {
  return () => ({ queryKey: [key], queryFn: async () => data });
}

vi.mock("@bessel/client", () => ({
  listBankConnectionsV1BankConnectionsGetOptions: query("connections", {
    available: true,
    banks: [],
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
    busy: false,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { AddAccountDialog } = await import("./add-account-dialog");

afterEach(() => {
  cleanup();
  create.mockClear();
  linkBank.mockClear();
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

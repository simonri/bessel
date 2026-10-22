import type { AccountOverview } from "@bessel/client";
import {
  deleteBankAccountV1BankAccountsBankAccountIdDeleteMutation,
  getAccountsOverviewV1BankAccountsOverviewGetOptions,
  getAccountsOverviewV1BankAccountsOverviewGetQueryKey,
  getNetWorthHistoryV1BankAccountsNetWorthGetOptions,
  getNetWorthHistoryV1BankAccountsNetWorthGetQueryKey,
  listBankAccountsV1BankAccountsGetQueryKey,
  listTradesV1InvestmentsTradesGetQueryKey,
  listTransactionsV1TransactionsGetQueryKey,
} from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AccountActionsProvider,
  CONNECTING_BANK_KEY,
  type PickSource,
  SYNC_POLL_MS,
  useAccountActions,
} from "@/components/accounts/account-actions";
import { AccountPanel } from "@/components/accounts/account-panel";
import {
  AccountList,
  NeedsAttention,
  WhereItIs,
} from "@/components/accounts/accounts-overview";
import {
  AddAccountDialog,
  type AddStep,
} from "@/components/accounts/add-account-dialog";
import { NetWorthCard } from "@/components/accounts/net-worth-card";
import {
  PageHeader,
  PrimaryButton,
  placeholderKeys,
} from "@/components/ui-kit";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import { HideAmountsButton } from "@/lib/privacy";

export const Route = createFileRoute("/_app/accounts")({
  component: Accounts,
});

const UNDO_MS = 6_000;

function Accounts() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<AddStep | null>(null);
  const review = useCallback((a: AccountOverview) => setOpenId(a.id), []);
  const pickAvanza = useCallback(
    () => setAdding({ step: "pick", source: "avanza" }),
    [],
  );
  const pick = useCallback((source: PickSource) => {
    setOpenId(null);
    setAdding(
      source.kind === "bank"
        ? { step: "pick", source: "bank", bankName: source.bankName }
        : { step: "pick", source: "avanza" },
    );
  }, []);
  return (
    <AccountActionsProvider
      onReview={review}
      onAvanzaConnected={pickAvanza}
      onPick={pick}
    >
      <AccountsPage
        openId={openId}
        onOpen={setOpenId}
        adding={adding}
        onAdding={setAdding}
      />
    </AccountActionsProvider>
  );
}

function AccountsPage({
  openId,
  onOpen,
  adding,
  onAdding,
}: {
  openId: string | null;
  onOpen: (id: string | null) => void;
  adding: AddStep | null;
  onAdding: (state: AddStep | null) => void;
}) {
  const { pollUntil } = useAccountActions();
  const queryClient = useQueryClient();
  const refetchInterval = () => (Date.now() < pollUntil ? SYNC_POLL_MS : false);
  const { data, isLoading } = useQuery({
    ...getAccountsOverviewV1BankAccountsOverviewGetOptions({ client }),
    refetchInterval,
  });
  const { data: history } = useQuery({
    ...getNetWorthHistoryV1BankAccountsNetWorthGetOptions({ client }),
    refetchInterval,
  });
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  // Back from a bank's approval page: choose which of its accounts to bring in.
  useEffect(() => {
    let bank: string | null = null;
    try {
      bank = sessionStorage.getItem(CONNECTING_BANK_KEY);
      sessionStorage.removeItem(CONNECTING_BANK_KEY);
    } catch {}
    if (bank) onAdding({ step: "pick", source: "bank", bankName: bank });
  }, [onAdding]);

  const deleteMutation = useMutation({
    ...deleteBankAccountV1BankAccountsBankAccountIdDeleteMutation({ client }),
    onError: (error, { path }) => {
      setRemoved((current) => without(current, path.bank_account_id));
      toast.error(errorDetail(error, "Couldn't remove the account"));
    },
    onSettled: () => {
      for (const queryKey of [
        getAccountsOverviewV1BankAccountsOverviewGetQueryKey({ client }),
        getNetWorthHistoryV1BankAccountsNetWorthGetQueryKey({ client }),
        listBankAccountsV1BankAccountsGetQueryKey({ client }),
        // Removing an account deletes its transactions and trades with it.
        listTransactionsV1TransactionsGetQueryKey({ client }),
        listTradesV1InvestmentsTradesGetQueryKey({ client }),
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  // Hidden at once, deleted only once the undo has passed.
  const remove = (account: AccountOverview) => {
    onOpen(null);
    setRemoved((current) => new Set(current).add(account.id));
    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      deleteMutation.mutate({ client, path: { bank_account_id: account.id } });
    };
    toast(`${account.name} removed`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          settled = true;
          setRemoved((current) => without(current, account.id));
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    });
  };

  const accounts = (data?.accounts ?? []).filter((a) => !removed.has(a.id));
  const open = accounts.find((a) => a.id === openId) ?? null;
  const issues = accounts.filter((a) => a.source.problem).length;
  const currency =
    data?.totals.find((t) => t.owner === "personal")?.currency ??
    data?.totals[0]?.currency;
  const inCurrency = data?.totals.filter((t) => t.currency === currency) ?? [];
  const total = inCurrency.reduce((sum, t) => sum + t.net, 0);
  const hasCompany = inCurrency.some((t) => t.owner === "company");
  const points =
    history?.series.find((s) => s.currency === currency)?.points ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Accounts"
        summary={
          isLoading
            ? null
            : accounts.length === 0
              ? "Add your first account to see everything in one place."
              : issues > 0
                ? `${accounts.length} accounts - ${issues} need${issues === 1 ? "s" : ""} you`
                : `${accounts.length} accounts, all up to date`
        }
      >
        <HideAmountsButton />
        <PrimaryButton size="sm" onClick={() => onAdding({ step: "choose" })}>
          <Plus aria-hidden />
          Add account
        </PrimaryButton>
      </PageHeader>

      {isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl bg-white/[0.06] lg:col-span-2" />
          <div className="space-y-4">
            {placeholderKeys(2).map((key) => (
              <Skeleton key={key} className="h-32 rounded-xl bg-white/[0.06]" />
            ))}
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState onAdd={() => onAdding({ step: "choose" })} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-5 lg:col-span-2">
            {currency && (
              <NetWorthCard
                total={total}
                currency={currency}
                points={points}
                hint={
                  hasCompany
                    ? "Yours and your company's, before tax"
                    : "Everything you have, minus what you owe"
                }
              />
            )}
            {/* On a phone, what needs fixing comes before the list. */}
            <div className="lg:hidden">
              <NeedsAttention accounts={accounts} />
            </div>
            <AccountList
              accounts={accounts}
              onOpen={(account) => onOpen(account.id)}
            />
          </div>
          <div className="min-w-0 space-y-4 lg:sticky lg:top-4">
            <div className="hidden lg:block">
              <NeedsAttention accounts={accounts} />
            </div>
            {currency && <WhereItIs totals={data.totals} currency={currency} />}
          </div>
        </div>
      )}

      <AccountPanel
        account={open}
        onOpenChange={(isOpen) => !isOpen && onOpen(null)}
        onRemove={remove}
      />
      <AddAccountDialog state={adding} onStateChange={onAdding} />
    </div>
  );
}

function without(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/[0.07] bg-white/[0.03] px-6 py-14 text-center">
      <p className="type-heading text-white/90">All your money in one place</p>
      <p className="mt-1 max-w-sm text-13 text-white/50">
        Connect your bank to see balances and spending update by themselves.
        Bessel can only read - it never moves money.
      </p>
      <PrimaryButton className="mt-5" onClick={onAdd}>
        <Plus aria-hidden />
        Add your first account
      </PrimaryButton>
    </div>
  );
}

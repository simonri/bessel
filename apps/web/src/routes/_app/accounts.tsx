import type { AccountOverview } from "@bessel/client";
import {
  deleteBankAccountV1BankAccountsBankAccountIdDeleteMutation,
  getAccountsOverviewV1BankAccountsOverviewGetOptions,
  getAccountsOverviewV1BankAccountsOverviewGetQueryKey,
  listBankAccountsV1BankAccountsGetQueryKey,
  listTradesV1InvestmentsTradesGetQueryKey,
  listTransactionsV1TransactionsGetQueryKey,
} from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  AccountGroups,
  CashChart,
  NetWorth,
} from "@/components/accounts/accounts-overview";
import { AvanzaSection } from "@/components/avanza/avanza-section";
import { ConnectedBanks } from "@/components/bank-connections/connected-banks";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { CreateAccountDialog } from "@/components/create-account-dialog";
import { PageHeader, placeholderKeys } from "@/components/ui-kit";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/accounts")({
  component: Accounts,
});

function Accounts() {
  const [deleteTarget, setDeleteTarget] = useState<AccountOverview | null>(
    null,
  );
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    getAccountsOverviewV1BankAccountsOverviewGetOptions({ client }),
  );

  const deleteMutation = useMutation({
    ...deleteBankAccountV1BankAccountsBankAccountIdDeleteMutation({ client }),
    onSuccess: () => setDeleteTarget(null),
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't delete the account")),
    onSettled: () => {
      for (const queryKey of [
        getAccountsOverviewV1BankAccountsOverviewGetQueryKey({ client }),
        listBankAccountsV1BankAccountsGetQueryKey({ client }),
        // Deleting an account deletes its transactions and trades with it.
        listTransactionsV1TransactionsGetQueryKey({ client }),
        listTradesV1InvestmentsTradesGetQueryKey({ client }),
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  const accounts = data?.accounts ?? [];
  const issues = accounts.filter((a) => a.source.problem).length;
  const mainCurrency = data?.totals.find(
    (t) => t.owner === "personal",
  )?.currency;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Accounts"
        summary={
          isLoading
            ? null
            : accounts.length === 0
              ? "No accounts yet. Add one, or connect a bank below."
              : issues > 0
                ? `${accounts.length} accounts - ${issues} need${issues === 1 ? "s" : ""} attention.`
                : `${accounts.length} accounts, all up to date.`
        }
      >
        <CreateAccountDialog />
      </PageHeader>

      {isLoading || !data ? (
        <div className="space-y-2">
          {placeholderKeys(6).map((key) => (
            <Skeleton
              key={key}
              className="h-12 w-full rounded-lg bg-white/[0.06]"
            />
          ))}
        </div>
      ) : (
        <>
          <NetWorth totals={data.totals} />
          {mainCurrency && (
            <CashChart accounts={accounts} currency={mainCurrency} />
          )}
          <AccountGroups data={data} onDelete={setDeleteTarget} />
        </>
      )}

      <ConnectedBanks />

      <AvanzaSection />

      <ConfirmDeleteDialog
        size="sm"
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete account?"
        description={
          <>
            &ldquo;{deleteTarget?.name}&rdquo; and all its transactions will be
            permanently removed. This can&rsquo;t be undone.
          </>
        }
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate({
            client,
            path: { bank_account_id: deleteTarget.id },
          });
        }}
        isPending={deleteMutation.isPending}
        pendingLabel="Deleting…"
      />
    </div>
  );
}

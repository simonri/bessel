import type { AccountOverview, BankAccountUpdate } from "@bessel/client";
import {
  disconnectAvanzaMutation,
  disconnectBankConnectionMutation,
  disconnectMontroseMutation,
  getAccountsOverviewQueryKey,
  getAvanzaOptions,
  getMontroseOptions,
  getNetWorthHistoryQueryKey,
  listBankAccountsQueryKey,
  listBankConnectionsOptions,
  listTransactionsOptions,
  updateBankAccountMutation,
} from "@bessel/client";
import { Input } from "@bessel/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@bessel/ui/components/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@bessel/ui/components/sheet";
import { Switch } from "@bessel/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, Pencil, ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { toast } from "sonner";
import { useAccountActions } from "@/components/accounts/account-actions";
import {
  AccountLogo,
  accountValue,
  sourceName,
} from "@/components/accounts/accounts-overview";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { displayName } from "@/components/transactions/transaction-naming";
import { IconButton, SoftButton } from "@/components/ui-kit";
import { ACCOUNT_SUBTYPES } from "@/lib/account-constants";
import { accountTypeLabel, problemCopy } from "@/lib/account-labels";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import { Amount } from "@/lib/privacy";

const LINE = "var(--color-primary-400)";

/** One account up close: its balance, what's happening in it, where its data comes from and its settings. */
export function AccountPanel({
  account,
  onOpenChange,
  onRemove,
}: {
  account: AccountOverview | null;
  onOpenChange: (open: boolean) => void;
  onRemove: (account: AccountOverview) => void;
}) {
  return (
    <Sheet open={!!account} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto border-white/10 bg-panel p-0 sm:max-w-md"
      >
        {account && (
          <PanelBody key={account.id} account={account} onRemove={onRemove} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    ...updateBankAccountMutation({ client }),
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't save the change")),
    onSettled: () => {
      for (const queryKey of [
        getAccountsOverviewQueryKey({ client }),
        getNetWorthHistoryQueryKey({ client }),
        listBankAccountsQueryKey({ client }),
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}

function PanelBody({
  account,
  onRemove,
}: {
  account: AccountOverview;
  onRemove: (account: AccountOverview) => void;
}) {
  const update = useUpdateAccount();
  const save = (body: BankAccountUpdate) =>
    update.mutate({ client, path: { bank_account_id: account.id }, body });
  const [removing, setRemoving] = useState(false);
  const investments = account.holdings_value != null;

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-start gap-3 border-b border-white/[0.06] px-5 pt-5 pb-4 pr-12">
        <AccountLogo account={account} size="lg" />
        <div className="min-w-0 flex-1">
          <AccountName
            name={account.name}
            onRename={(name) => save({ name })}
          />
          <SheetDescription className="type-caption text-white/45">
            {accountTypeLabel(account)} - {sourceName(account)}
          </SheetDescription>
        </div>
      </header>

      <div className="space-y-6 px-5 py-5">
        <section>
          <Amount
            value={accountValue(account)}
            currency={account.currency}
            className="block type-display text-white"
          />
          {investments && (
            <p className="mt-1 type-caption text-white/45">
              <Amount
                value={account.holdings_value ?? 0}
                currency={account.currency}
              />{" "}
              invested -{" "}
              <Amount
                value={account.current_balance ?? 0}
                currency={account.currency}
              />{" "}
              cash
            </p>
          )}
          <BalanceHistory account={account} />
        </section>

        <ProblemBanner account={account} />
        <RecentTransactions account={account} />
        <Connection account={account} />

        <section className="space-y-1">
          <h3 className="mb-2 type-section text-white/55">Settings</h3>
          <SettingRow
            label="Count toward net worth"
            description="Turn off for money that isn't yours, like a shared account you look after."
          >
            <Switch
              checked={account.include_in_net_worth}
              onCheckedChange={(checked) =>
                save({ include_in_net_worth: checked })
              }
              aria-label="Count toward net worth"
            />
          </SettingRow>
          <SettingRow
            label="Company account"
            description="Its money is your company's, kept apart from your own."
          >
            <Switch
              checked={account.is_business}
              onCheckedChange={(checked) => save({ is_business: checked })}
              aria-label="Company account"
            />
          </SettingRow>
          <SettingRow label="Kind of account">
            <NativeSelect
              size="sm"
              className="w-40 text-12"
              aria-label="Kind of account"
              value={account.subtype}
              onChange={(event) => save({ subtype: event.target.value })}
            >
              {ACCOUNT_SUBTYPES.map((s) => (
                <NativeSelectOption key={s.value} value={s.value}>
                  {s.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </SettingRow>
        </section>
      </div>

      <footer className="mt-auto border-t border-white/[0.06] px-5 py-4">
        <button
          type="button"
          onClick={() => setRemoving(true)}
          className="text-12 font-medium text-rose-300/80 transition-colors hover:text-rose-300"
        >
          Remove account
        </button>
      </footer>

      <ConfirmDeleteDialog
        size="sm"
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${account.name}?`}
        description="It's removed from Bessel with its transactions. Nothing changes at your bank. You can undo for a few seconds."
        confirmLabel="Remove"
        onConfirm={() => {
          setRemoving(false);
          onRemove(account);
        }}
      />
    </div>
  );
}

function AccountName({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setDraft(name);
  };
  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        aria-label="Account name"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
        className="h-8 text-13"
      />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <SheetTitle className="truncate type-heading text-white/90">
        {name}
      </SheetTitle>
      <IconButton title="Rename" onClick={() => setEditing(true)}>
        <Pencil />
      </IconButton>
    </div>
  );
}

function BalanceHistory({ account }: { account: AccountOverview }) {
  const gradientId = `account-fill-${useId().replace(/[^\w-]/g, "")}`;
  const data = account.history.map((p) => ({
    month: p.month,
    balance: p.balance,
  }));
  if (data.length < 2) return null;
  return (
    <div className="mt-4 h-24">
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity={0.22} />
              <stop offset="100%" stopColor={LINE} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: "rgb(255 255 255 / 0.2)" }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as
                | (typeof data)[number]
                | undefined;
              if (!active || !point) return null;
              return (
                <div className="rounded-lg border border-white/10 bg-neutral-900/95 px-3 py-2 text-12 shadow-lg">
                  <p className="font-medium text-white/85">
                    End of {format(point.month, "MMMM")}
                  </p>
                  <Amount
                    value={point.balance}
                    currency={account.currency}
                    className="text-white/60"
                  />
                </div>
              );
            }}
          />
          <Area
            type="stepAfter"
            dataKey="balance"
            stroke={LINE}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <p className="mt-1 type-caption text-white/35">
        Month-end balance, last {data.length} months
      </p>
    </div>
  );
}

function ProblemBanner({ account }: { account: AccountOverview }) {
  const { run, busy } = useAccountActions();
  const problem = account.source.issue;
  if (!problem) return null;
  const copy = problemCopy(account, problem);
  return (
    <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-amber-300/90"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-13 font-medium text-amber-100/90">{copy.title}</p>
          {problem.kind === "balance_mismatch" &&
            problem.source_balance != null && (
              <p className="mt-0.5 type-caption text-amber-100/60">
                {sourceName(account)} shows{" "}
                <Amount
                  value={problem.source_balance}
                  currency={account.currency}
                />
                , Bessel shows{" "}
                <Amount
                  value={account.current_balance ?? 0}
                  currency={account.currency}
                />
                . A transaction may be missing or still pending.
              </p>
            )}
          {problem.detail && (
            <p className="mt-0.5 type-caption text-amber-100/60">
              {problem.detail}
            </p>
          )}
        </div>
      </div>
      {copy.action !== "review" && (
        <SoftButton
          className="mt-3 w-full"
          size="default"
          onClick={() => run(copy.action, account)}
          disabled={busy}
        >
          {copy.actionLabel}
        </SoftButton>
      )}
    </div>
  );
}

function RecentTransactions({ account }: { account: AccountOverview }) {
  const { data } = useQuery(
    listTransactionsOptions({
      client,
      query: {
        bank_account_id: [account.id],
        limit: 5,
        page: 1,
        sorting: ["-transaction_date"],
      },
    }),
  );
  const items = data?.items ?? [];
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="type-section text-white/55">Recent</h3>
        <Link
          to="/transactions"
          search={{ bank_account_id: [account.id] }}
          className="type-caption text-white/50 transition-colors hover:text-white/80"
        >
          See all
        </Link>
      </div>
      {data && items.length === 0 ? (
        <p className="type-caption text-white/40">No transactions yet.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <span className="w-12 shrink-0 type-caption text-white/40">
                {format(t.transaction_date, "d MMM")}
              </span>
              <span className="min-w-0 flex-1 truncate text-13 text-white/75">
                {displayName(t)}
              </span>
              <Amount
                value={t.direction === "credit" ? t.amount : -t.amount}
                currency={t.currency}
                sign
                className={
                  t.direction === "credit"
                    ? "text-13 text-emerald-300/90"
                    : "text-13 text-white/75"
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Connection({ account }: { account: AccountOverview }) {
  const { run, pick, busy } = useAccountActions();
  const { source } = account;
  const [disconnecting, setDisconnecting] = useState(false);
  const queryClient = useQueryClient();
  const { data: connections } = useQuery({
    ...listBankConnectionsOptions({ client }),
    enabled: source.kind === "bank",
  });
  const connection = connections?.connections.find(
    (c) => c.bank_name === source.label,
  );
  const { data: avanza } = useQuery({
    ...getAvanzaOptions({ client }),
    enabled: source.kind === "avanza",
  });
  const { data: montrose } = useQuery({
    ...getMontroseOptions({ client }),
    enabled: source.kind === "montrose",
  });
  const notBroughtIn =
    source.kind === "bank"
      ? (connection?.accounts.filter((a) => a.shared && !a.bank_account_id)
          .length ?? 0)
      : source.kind === "avanza"
        ? (avanza?.connection?.accounts.filter((a) => !a.bank_account_id)
            .length ?? 0)
        : source.kind === "montrose"
          ? (montrose?.connection?.accounts.filter((a) => !a.bank_account_id)
              .length ?? 0)
          : 0;
  const afterDisconnect = () => {
    setDisconnecting(false);
    void queryClient.invalidateQueries({
      queryKey: getAccountsOverviewQueryKey({
        client,
      }),
    });
  };
  const disconnectBank = useMutation({
    ...disconnectBankConnectionMutation({
      client,
    }),
    onSuccess: afterDisconnect,
    onError: (error) => toast.error(errorDetail(error, "Couldn't disconnect")),
  });
  const disconnectAvanza = useMutation({
    ...disconnectAvanzaMutation({ client }),
    onSuccess: afterDisconnect,
    onError: (error) => toast.error(errorDetail(error, "Couldn't disconnect")),
  });
  const disconnectMontrose = useMutation({
    ...disconnectMontroseMutation({ client }),
    onSuccess: afterDisconnect,
    onError: (error) => toast.error(errorDetail(error, "Couldn't disconnect")),
  });
  const updated = source.synced_at
    ? `Updated ${formatDistanceToNow(source.synced_at, { addSuffix: true })}`
    : account.last_transaction
      ? `Last transaction ${format(account.last_transaction, "d MMM yyyy")}`
      : null;

  let body: ReactNode;
  if (source.kind === "bank") {
    body = (
      <>
        <p className="flex items-center gap-1.5 text-13 text-white/80">
          <ShieldCheck className="size-4 text-emerald-300/90" aria-hidden />
          Read-only access to {source.label}
        </p>
        <p className="mt-0.5 type-caption text-white/45">
          {source.access_until &&
            `Until ${format(source.access_until, "d MMM yyyy")} - `}
          Bessel can see balances and transactions, never move money.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SoftButton onClick={() => run("sync", account)} disabled={busy}>
            Update now
          </SoftButton>
          <SoftButton onClick={() => run("renew", account)} disabled={busy}>
            Renew access
          </SoftButton>
        </div>
      </>
    );
  } else if (source.kind === "avanza") {
    body = (
      <>
        <p className="text-13 text-white/80">Connected to Avanza</p>
        <p className="mt-0.5 type-caption text-white/45">
          Bessel signs in to read your accounts, trades and holdings.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SoftButton onClick={() => run("sync", account)} disabled={busy}>
            Update now
          </SoftButton>
          <SoftButton onClick={() => run("sign_in", account)}>
            Change login
          </SoftButton>
        </div>
      </>
    );
  } else if (source.kind === "montrose") {
    body = (
      <>
        <p className="text-13 text-white/80">Connected to Montrose</p>
        <p className="mt-0.5 type-caption text-white/45">
          {source.access_until
            ? `Read-only access until ${format(source.access_until, "d MMM yyyy")}, then approve again with BankID.`
            : "Read-only access, approved with BankID."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SoftButton onClick={() => run("sync", account)} disabled={busy}>
            Update now
          </SoftButton>
          <SoftButton onClick={() => run("renew", account)} disabled={busy}>
            Renew access
          </SoftButton>
        </div>
      </>
    );
  } else if (source.kind === "klarna") {
    body = (
      <>
        <p className="text-13 text-white/80">Imported from Klarna</p>
        <p className="mt-0.5 type-caption text-white/45">
          Sign in to Klarna with BankID to bring in new purchases and payments.
        </p>
        <SoftButton
          className="mt-3"
          onClick={() => run("import_klarna", account)}
        >
          Import again
        </SoftButton>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-13 text-white/80">
          {source.import_bank
            ? `You upload files from ${sourceName(account)}`
            : "Added by you"}
        </p>
        <p className="mt-0.5 type-caption text-white/45">
          Download the latest transactions from your bank and upload them here.
        </p>
        <SoftButton className="mt-3" onClick={() => run("upload", account)}>
          Upload a file
        </SoftButton>
      </>
    );
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="type-section text-white/55">Where it comes from</h3>
        {updated && (
          <span className="type-caption text-white/40">{updated}</span>
        )}
      </div>
      {body}
      {notBroughtIn > 0 && (
        <button
          type="button"
          onClick={() =>
            pick(
              source.kind === "avanza" || source.kind === "montrose"
                ? { kind: source.kind }
                : { kind: "bank", bankName: source.label },
            )
          }
          className="mt-3 block type-caption text-primary-300 transition-colors hover:text-primary-200"
        >
          {notBroughtIn} more account{notBroughtIn === 1 ? "" : "s"} at{" "}
          {source.label} - choose
        </button>
      )}
      {(source.kind === "avanza" ||
        source.kind === "montrose" ||
        (source.kind === "bank" && connection)) && (
        <button
          type="button"
          onClick={() => setDisconnecting(true)}
          className="mt-3 block type-caption text-white/40 underline-offset-2 transition-colors hover:text-white/70 hover:underline"
        >
          Disconnect {source.label}
        </button>
      )}
      <ConfirmDeleteDialog
        size="sm"
        open={disconnecting}
        onOpenChange={setDisconnecting}
        title={`Disconnect ${source.label}?`}
        description="Bessel stops importing from it. Everything already imported stays."
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        isPending={
          disconnectBank.isPending ||
          disconnectAvanza.isPending ||
          disconnectMontrose.isPending
        }
        onConfirm={() => {
          if (source.kind === "avanza") disconnectAvanza.mutate({ client });
          else if (source.kind === "montrose")
            disconnectMontrose.mutate({ client });
          else if (connection)
            disconnectBank.mutate({
              client,
              path: { connection_id: connection.id },
            });
        }}
      />
    </section>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-13 text-white/80">{label}</p>
        {description && (
          <p className="type-caption text-white/40">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

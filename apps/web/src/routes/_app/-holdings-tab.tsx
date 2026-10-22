import type { HoldingSchema, InvestmentAccountSummary } from "@bessel/client";
import {
  getHoldingsV1InvestmentsHoldingsGetOptions,
  getInvestmentAccountsV1InvestmentsAccountsGetOptions,
} from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import {
  BarRow,
  EmptyState,
  Panel,
  placeholderKeys,
  SectionLabel,
} from "@/components/ui-kit";
import { client } from "@/lib/client";
import type { DataColumnDef } from "@/lib/data-table";
import { formatAmount, formatMoney, formatQuantity } from "@/lib/money";
import { cn } from "@/lib/utils";

const NUMERIC_CELL = "text-right tabular-nums text-white/70";
const LARGEST = 8;

function whole(minor: number, currency: string): string {
  return formatMoney(Math.round(minor / 100) * 100, currency).replace(
    /,00(?= )/,
    "",
  );
}

function signed(minor: number, currency: string): string {
  return `${minor >= 0 ? "+" : "-"}${whole(Math.abs(minor), currency)}`;
}

function percent(part: number, of: number): string | null {
  return of > 0
    ? `${part >= 0 ? "+" : ""}${((part / of) * 100).toFixed(1)}%`
    : null;
}

function gainClass(value: number) {
  return value >= 0 ? "text-income" : "text-expense";
}

export function AccountCard({
  account,
}: {
  account: InvestmentAccountSummary;
}) {
  const thisYear = new Date().getFullYear();
  const dividends =
    account.dividends.find((d) => d.year === thisYear)?.amount ?? 0;
  const lifetimeDividends = account.dividends.reduce((s, d) => s + d.amount, 0);
  const madePct = percent(account.growth, account.net_deposits);
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-13 font-medium text-white/85">
          {account.name}
        </p>
        {account.is_business && (
          <span className="shrink-0 rounded-md border border-white/15 px-1.5 py-px text-10 font-semibold text-white/55">
            Company
          </span>
        )}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-white/90">
        {whole(account.total, account.currency)}
      </p>
      <p className="text-11 text-white/40">
        {whole(account.holdings_value, account.currency)} invested -{" "}
        {whole(account.cash, account.currency)} cash
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-12">
        <dt className="text-white/45">Put in</dt>
        <dd className="text-right tabular-nums text-white/75">
          {whole(account.net_deposits, account.currency)}
        </dd>
        <dt className="text-white/45">Made</dt>
        <dd
          className={cn("text-right tabular-nums", gainClass(account.growth))}
        >
          {signed(account.growth, account.currency)}
          {madePct && (
            <span className="ml-1 text-11 opacity-80">{madePct}</span>
          )}
        </dd>
        <dt className="text-white/45">Unrealized</dt>
        <dd
          className={cn(
            "text-right tabular-nums",
            gainClass(account.holdings_value - account.acquired_value),
          )}
        >
          {signed(
            account.holdings_value - account.acquired_value,
            account.currency,
          )}
        </dd>
        <dt className="text-white/45">Dividends {thisYear}</dt>
        <dd className="text-right tabular-nums text-white/75">
          {whole(dividends, account.currency)}
          {lifetimeDividends > dividends && (
            <span className="ml-1 text-11 text-white/40">
              {whole(lifetimeDividends, account.currency)} all time
            </span>
          )}
        </dd>
      </dl>
    </div>
  );
}

function positionColumns(
  showAccount: boolean,
  accountNames: Map<string, string>,
  scopeValue: number,
): DataColumnDef<HoldingSchema>[] {
  return [
    {
      accessorKey: "security_name",
      header: "Security",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-white/85">
            {row.original.security_name}
          </div>
          {showAccount && row.original.bank_account_id && (
            <div className="truncate text-11 text-white/40">
              {accountNames.get(row.original.bank_account_id)}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "quantity",
      header: () => <div className="text-right">Quantity</div>,
      size: 110,
      cell: ({ row }) => (
        <div className={NUMERIC_CELL}>
          {formatQuantity(row.original.quantity)}
        </div>
      ),
    },
    {
      accessorKey: "current_value",
      header: () => <div className="text-right">Value</div>,
      size: 140,
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums text-white/85">
          {row.original.current_value != null
            ? formatMoney(row.original.current_value, row.original.currency)
            : "—"}
        </div>
      ),
    },
    {
      id: "share",
      header: () => <div className="text-right">Share</div>,
      size: 80,
      cell: ({ row }) => (
        <div className={NUMERIC_CELL}>
          {row.original.current_value != null && scopeValue > 0
            ? `${Math.round((row.original.current_value / scopeValue) * 100)}%`
            : "—"}
        </div>
      ),
    },
    {
      accessorKey: "gain_loss",
      header: () => <div className="text-right">Gain or loss</div>,
      size: 170,
      cell: ({ row }) => {
        const { gain_loss, gain_loss_pct } = row.original;
        if (gain_loss == null)
          return <div className="text-right text-white/30">—</div>;
        return (
          <div className={cn("text-right tabular-nums", gainClass(gain_loss))}>
            {gain_loss >= 0 ? "+" : ""}
            {formatAmount(gain_loss)}
            {gain_loss_pct != null && (
              <span className="ml-1.5 text-11 opacity-80">
                {gain_loss_pct >= 0 ? "+" : ""}
                {gain_loss_pct.toFixed(1)}%
              </span>
            )}
          </div>
        );
      },
    },
  ];
}

export function HoldingsTab() {
  const { data: holdingsData, isLoading: holdingsLoading } = useQuery(
    getHoldingsV1InvestmentsHoldingsGetOptions({ client }),
  );
  const { data: accountsData, isLoading: accountsLoading } = useQuery(
    getInvestmentAccountsV1InvestmentsAccountsGetOptions({ client }),
  );
  const [scope, setScope] = useState<string | null>(null);

  const accounts = accountsData?.items ?? [];
  const accountNames = useMemo(
    () => new Map(accounts.map((a) => [a.bank_account_id, a.name])),
    [accounts],
  );
  const holdings = useMemo(
    () =>
      (holdingsData?.items ?? [])
        .filter((h) => !scope || h.bank_account_id === scope)
        .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0)),
    [holdingsData, scope],
  );
  const scopeValue = holdings.reduce((s, h) => s + (h.current_value ?? 0), 0);
  const columns = useMemo(
    () =>
      positionColumns(!scope && accounts.length > 1, accountNames, scopeValue),
    [scope, accounts.length, accountNames, scopeValue],
  );

  if (holdingsLoading || accountsLoading) {
    return (
      <div className="space-y-2">
        {placeholderKeys(6).map((key) => (
          <Skeleton
            key={key}
            className="h-10 w-full rounded-lg bg-white/[0.06]"
          />
        ))}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp />}
        title="No investment accounts yet"
        className="py-12"
      >
        <p>
          Connect Avanza on the{" "}
          <Link to="/accounts" className="underline underline-offset-2">
            Accounts
          </Link>{" "}
          page and link an account to import your holdings.
        </p>
      </EmptyState>
    );
  }

  const shown = accounts.filter((a) => !scope || a.bank_account_id === scope);
  const largest = holdings.slice(0, LARGEST);
  const rest = holdings
    .slice(LARGEST)
    .reduce((s, h) => s + (h.current_value ?? 0), 0);
  const top = largest[0]?.current_value ?? 0;
  const currency = holdings[0]?.currency ?? shown[0]?.currency ?? "SEK";

  return (
    <div className="space-y-5">
      {accounts.length > 1 && (
        <div
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label="Account"
        >
          {[{ bank_account_id: null, name: "All accounts" }, ...accounts].map(
            (a) => (
              <button
                key={a.bank_account_id ?? "all"}
                type="button"
                role="tab"
                aria-selected={scope === a.bank_account_id}
                onClick={() => setScope(a.bank_account_id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-12 font-medium transition-colors duration-150",
                  scope === a.bank_account_id
                    ? "bg-white/10 text-white/90"
                    : "text-white/45 hover:text-white/80",
                )}
              >
                {a.name}
              </button>
            ),
          )}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2">
        {shown.map((account) => (
          <AccountCard key={account.bank_account_id} account={account} />
        ))}
      </div>

      {largest.length > 0 && (
        <section>
          <SectionLabel>Largest holdings</SectionLabel>
          <Panel className="space-y-2.5 divide-y-0 px-4 py-3.5">
            {largest.map((h) => (
              <BarRow
                key={`${h.bank_account_id}-${h.security_id}`}
                label={h.security_name}
                fraction={top > 0 ? (h.current_value ?? 0) / top : 0}
                value={whole(h.current_value ?? 0, h.currency)}
                detail={
                  scopeValue > 0
                    ? `${Math.round(((h.current_value ?? 0) / scopeValue) * 100)}%`
                    : undefined
                }
              />
            ))}
            {rest > 0 && (
              <BarRow
                label={`${holdings.length - LARGEST} more`}
                fraction={top > 0 ? rest / top : 0}
                value={whole(rest, currency)}
                detail={`${Math.round((rest / scopeValue) * 100)}%`}
                color="rgb(255 255 255 / 0.25)"
              />
            )}
          </Panel>
        </section>
      )}

      <section>
        <SectionLabel>Positions</SectionLabel>
        <DataTable columns={columns} data={holdings} />
      </section>
    </div>
  );
}

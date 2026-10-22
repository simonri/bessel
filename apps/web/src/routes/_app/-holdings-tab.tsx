import type { HoldingSchema, InvestmentAccountSummary } from "@bessel/client";
import {
  getHoldingsV1InvestmentsHoldingsGetOptions,
  getInvestmentAccountsV1InvestmentsAccountsGetOptions,
} from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { BankLogo } from "@/components/bank-logo";
import { EmptyState, Panel } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { formatQuantity } from "@/lib/money";
import { Amount } from "@/lib/privacy";
import { cn } from "@/lib/utils";

const LARGEST = 6;

export function percent(part: number, of: number): string | null {
  return of > 0
    ? `${part >= 0 ? "+" : ""}${((part / of) * 100).toFixed(1).replace(".", ",")}%`
    : null;
}

export interface InvestmentTotals {
  currency: string;
  total: number;
  cash: number;
  netDeposits: number;
  growth: number;
  dividendsThisYear: number;
  /** What the accounts cost this year: below zero, like interest on a loan, a KF's yield tax and fees. */
  interestThisYear: number;
  taxThisYear: number;
  feesThisYear: number;
  hasCompany: boolean;
}

function inYear(amounts: { year: number; amount: number }[], year: number) {
  return amounts.find((a) => a.year === year)?.amount ?? 0;
}

/** The accounts added up per currency; growth is what they're worth beyond what was put in. */
export function investmentTotals(
  accounts: InvestmentAccountSummary[],
  year: number,
): InvestmentTotals[] {
  const totals = new Map<string, InvestmentTotals>();
  for (const a of accounts) {
    const t = totals.get(a.currency) ?? {
      currency: a.currency,
      total: 0,
      cash: 0,
      netDeposits: 0,
      growth: 0,
      dividendsThisYear: 0,
      interestThisYear: 0,
      taxThisYear: 0,
      feesThisYear: 0,
      hasCompany: false,
    };
    t.total += a.total;
    t.cash += a.cash;
    t.netDeposits += a.net_deposits;
    t.growth += a.growth;
    t.dividendsThisYear += inYear(a.dividends, year);
    t.interestThisYear += inYear(a.interest, year);
    t.taxThisYear += inYear(a.tax, year);
    t.feesThisYear += inYear(a.fees, year);
    t.hasCompany ||= a.is_business;
    totals.set(a.currency, t);
  }
  return [...totals.values()];
}

export interface Slice {
  key: string;
  label: string;
  value: number;
  share: number;
}

/** The biggest holdings and what share of the whole each is, with the rest as one slice. */
export function allocation(
  holdings: HoldingSchema[],
  limit = LARGEST,
): Slice[] {
  const valued = holdings
    .filter((h) => (h.current_value ?? 0) > 0)
    .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0));
  const whole = valued.reduce((s, h) => s + (h.current_value ?? 0), 0);
  if (whole === 0) return [];
  const slices: Slice[] = valued.slice(0, limit).map((h) => ({
    key: `${h.bank_account_id}-${h.security_id}`,
    label: h.security_name,
    value: h.current_value ?? 0,
    share: (h.current_value ?? 0) / whole,
  }));
  const rest = valued
    .slice(limit)
    .reduce((s, h) => s + (h.current_value ?? 0), 0);
  if (rest > 0) {
    slices.push({
      key: "rest",
      label: `${valued.length - limit} more`,
      value: rest,
      share: rest / whole,
    });
  }
  return slices;
}

// One hue, fading for smaller slices: the order is the information, not the colour.
const SLICE_STRENGTH = [100, 72, 52, 38, 28, 20];

function sliceColor(index: number, key: string): string {
  if (key === "rest") return "rgb(255 255 255 / 0.18)";
  const strength = SLICE_STRENGTH[Math.min(index, SLICE_STRENGTH.length - 1)];
  return `color-mix(in srgb, var(--color-primary-400) ${strength}%, var(--color-panel))`;
}

function Growth({
  value,
  of,
  currency,
  className,
}: {
  value: number;
  of: number;
  currency: string;
  className?: string;
}) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "flex h-4 items-center justify-end gap-0.5 font-medium",
        up ? "text-income" : "text-expense",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <Amount value={value} currency={currency} sign />
      {percent(value, of) && (
        <span className="ml-1 font-normal opacity-80">
          {percent(value, of)}
        </span>
      )}
    </span>
  );
}

function Overview({
  totals,
  slices,
}: {
  totals: InvestmentTotals;
  slices: Slice[];
}) {
  const { currency } = totals;
  return (
    <Panel className="divide-y-0 p-5">
      <p className="type-label text-white/55">
        {totals.hasCompany
          ? "Yours and your company's"
          : "All your investments"}
      </p>
      <Amount
        value={totals.total}
        currency={currency}
        className="mt-1 block type-display text-white"
      />
      <p className="mt-1.5 flex items-center gap-2 type-caption">
        <Growth
          value={totals.growth}
          of={totals.netDeposits}
          currency={currency}
        />
        <span className="text-white/40">since you started</span>
      </p>

      <dl className="mt-5 grid grid-cols-3 gap-4">
        <Fact label={totals.netDeposits >= 0 ? "Put in" : "Taken out"}>
          <Amount value={Math.abs(totals.netDeposits)} currency={currency} />
        </Fact>
        <Fact label="Cash to invest">
          <Amount value={totals.cash} currency={currency} />
        </Fact>
        <Fact label={`Dividends ${new Date().getFullYear()}`}>
          <Amount value={totals.dividendsThisYear} currency={currency} />
        </Fact>
      </dl>
      <CostsThisYear totals={totals} />

      {slices.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 type-caption text-white/45">What it's in</p>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {slices.map((slice, index) => (
              <span
                key={slice.key}
                title={`${slice.label} ${Math.round(slice.share * 100)}%`}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${slice.share * 100}%`,
                  backgroundColor: sliceColor(index, slice.key),
                }}
              />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Tax, interest and fees taken from the accounts this year; already counted in the growth above. */
function CostsThisYear({ totals }: { totals: InvestmentTotals }) {
  const costs = [
    { label: "Tax", value: totals.taxThisYear },
    { label: "Interest", value: totals.interestThisYear },
    { label: "Fees", value: totals.feesThisYear },
  ].filter((c) => c.value !== 0);
  if (costs.length === 0) return null;
  return (
    <p className="mt-3 type-caption text-white/45">
      This year{" "}
      {costs.map((cost, i) => (
        <span key={cost.label}>
          {i > 0 && " - "}
          {cost.label}{" "}
          <Amount
            value={cost.value}
            currency={totals.currency}
            sign
            className="text-white/70"
          />
        </span>
      ))}
    </p>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="type-caption text-white/45">{label}</dt>
      <dd className="mt-0.5 text-13 font-medium text-white/85">{children}</dd>
    </div>
  );
}

function AccountPicker({
  accounts,
  scope,
  onScope,
}: {
  accounts: InvestmentAccountSummary[];
  scope: string | null;
  onScope: (id: string | null) => void;
}) {
  return (
    <Panel className="divide-y-0 p-3">
      <p className="px-2 pt-2 pb-1 type-label text-white/55">Accounts</p>
      <ul>
        {accounts.map((account) => {
          const picked = scope === account.bank_account_id;
          return (
            <li key={account.bank_account_id}>
              <button
                type="button"
                aria-pressed={picked}
                onClick={() => onScope(picked ? null : account.bank_account_id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-150",
                  picked ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                )}
              >
                <BankLogo name="Avanza" size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-13 font-medium text-white/85">
                      {account.name}
                    </span>
                    {account.is_business && (
                      <span className="shrink-0 rounded-md border border-white/15 px-1.5 type-badge text-white/55">
                        Company
                      </span>
                    )}
                  </span>
                  <span className="block truncate type-caption text-white/45">
                    {account.net_deposits >= 0 ? "Put in" : "Taken out"}{" "}
                    <Amount
                      value={Math.abs(account.net_deposits)}
                      currency={account.currency}
                    />
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Amount
                    value={account.total}
                    currency={account.currency}
                    className="block text-13 font-medium text-white/85"
                  />
                  <Growth
                    value={account.growth}
                    of={account.net_deposits}
                    currency={account.currency}
                    className="type-caption"
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function HoldingList({
  holdings,
  colors,
  accountNames,
  showAccount,
}: {
  holdings: HoldingSchema[];
  colors: Map<string, string>;
  accountNames: Map<string, string>;
  showAccount: boolean;
}) {
  return (
    <Panel>
      {holdings.map((h) => {
        const key = `${h.bank_account_id}-${h.security_id}`;
        const units = formatQuantity(h.quantity);
        return (
          <div key={key} className="flex items-center gap-3 px-5 py-3">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: colors.get(key) ?? "rgb(255 255 255 / 0.22)",
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-13 font-medium text-white/85">
                {h.security_name}
              </p>
              <p className="truncate type-caption text-white/45">
                {units} {h.asset_type === "stock" ? "shares" : "units"}
                {showAccount &&
                  h.bank_account_id &&
                  ` - ${accountNames.get(h.bank_account_id) ?? ""}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {h.current_value != null ? (
                <Amount
                  value={h.current_value}
                  currency={h.currency}
                  className="block text-13 font-medium text-white/85"
                />
              ) : (
                <span className="block text-13 text-white/40">No price</span>
              )}
              {h.gain_loss != null && (
                <Growth
                  value={h.gain_loss}
                  of={h.cost_basis}
                  currency={h.currency}
                  className="type-caption"
                />
              )}
            </div>
          </div>
        );
      })}
    </Panel>
  );
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

  if (holdingsLoading || accountsLoading) {
    return (
      <div className="grid gap-4 @4xl:grid-cols-3">
        <Skeleton className="h-64 rounded-xl bg-white/[0.06] @4xl:col-span-2" />
        <Skeleton className="h-64 rounded-xl bg-white/[0.06]" />
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
          Add Avanza on the{" "}
          <Link to="/accounts" className="underline underline-offset-2">
            Accounts
          </Link>{" "}
          page to see your holdings here.
        </p>
      </EmptyState>
    );
  }

  const shown = accounts.filter((a) => !scope || a.bank_account_id === scope);
  const [totals] = investmentTotals(shown, new Date().getFullYear());
  const slices = allocation(holdings);
  const colors = new Map(
    slices.map((slice, index) => [slice.key, sliceColor(index, slice.key)]),
  );

  return (
    <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-3">
      <div className="min-w-0 space-y-4 @4xl:col-span-2">
        {totals && <Overview totals={totals} slices={slices} />}
        {holdings.length > 0 && (
          <section aria-label="Holdings">
            <h2 className="mb-2 px-5 type-section text-white/55">Holdings</h2>
            <HoldingList
              holdings={holdings}
              colors={colors}
              accountNames={accountNames}
              showAccount={!scope && accounts.length > 1}
            />
          </section>
        )}
      </div>
      <div className="min-w-0 @4xl:sticky @4xl:top-4">
        <AccountPicker accounts={accounts} scope={scope} onScope={setScope} />
      </div>
    </div>
  );
}

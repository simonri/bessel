import type { AccountOverview, OverviewTotal } from "@bessel/client";
import { CheckCircle2, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useAccountActions } from "@/components/accounts/account-actions";
import { BankLogo } from "@/components/bank-logo";
import { FILE_BANKS } from "@/components/import-dialog";
import { Panel, SoftButton } from "@/components/ui-kit";
import {
  ACCOUNT_KINDS,
  accountKind,
  accountTypeLabel,
  problemCopy,
} from "@/lib/account-labels";
import { Amount } from "@/lib/privacy";
import { cn } from "@/lib/utils";

/** What an account is worth: an investment account's holdings count too. */
export function accountValue(account: AccountOverview): number {
  return (account.current_balance ?? 0) + (account.holdings_value ?? 0);
}

/** The bank or app an account's data comes from, as people know it. */
export function sourceName(account: AccountOverview): string {
  const { source } = account;
  if (source.kind === "klarna") return "Klarna";
  if (source.kind !== "manual") return source.label;
  return (
    FILE_BANKS.find((b) => b.value === source.import_bank)?.label ??
    account.name
  );
}

export function AccountLogo({
  account,
  size,
}: {
  account: AccountOverview;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <BankLogo
      name={sourceName(account)}
      logo={account.source.logo}
      size={size}
    />
  );
}

/** Net worth split into the company's, your own and what's owed; the three add up to it. */
export function WhereItIs({
  totals,
  currency,
}: {
  totals: OverviewTotal[];
  currency: string;
}) {
  const personal = totals.find(
    (t) => t.owner === "personal" && t.currency === currency,
  );
  const company = totals.find(
    (t) => t.owner === "company" && t.currency === currency,
  );
  const rows = [
    company && {
      label: "Company",
      value: company.cash + company.investments,
      detail: company,
    },
    personal && {
      label: "You",
      value: personal.cash + personal.investments,
      detail: personal,
    },
  ].filter((row) => !!row);
  const owed = (personal?.debt ?? 0) + (company?.debt ?? 0);
  const largest = Math.max(1, ...rows.map((r) => r.value), owed);
  return (
    <Panel className="divide-y-0 p-5">
      <p className="mb-3 type-label text-white/55">Where it is</p>
      <div className="space-y-3.5">
        {rows.map((row) => (
          <Share
            key={row.label}
            label={row.label}
            value={row.value}
            currency={currency}
            fraction={row.value / largest}
            detail={
              row.detail.investments === 0 ? (
                "All in cash"
              ) : (
                <>
                  <Amount value={row.detail.cash} currency={currency} compact />{" "}
                  cash -{" "}
                  <Amount
                    value={row.detail.investments}
                    currency={currency}
                    compact
                  />{" "}
                  invested
                </>
              )
            }
          />
        ))}
        {owed > 0 && (
          <Share
            label="Owed"
            value={-owed}
            currency={currency}
            fraction={owed / largest}
            detail="Pay later and cards"
            owed
          />
        )}
      </div>
    </Panel>
  );
}

function Share({
  label,
  value,
  currency,
  fraction,
  detail,
  owed,
}: {
  label: string;
  value: number;
  currency: string;
  fraction: number;
  detail: ReactNode;
  owed?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-13 text-white/75">{label}</span>
        <Amount
          value={value}
          currency={currency}
          compact
          className="text-13 font-medium text-white/85"
        />
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn(
            "h-full rounded-full",
            owed ? "bg-rose-400/70" : "bg-primary-500",
          )}
          style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }}
        />
      </div>
      <p className="mt-1 type-caption text-white/40">{detail}</p>
    </div>
  );
}

/** Accounts with a problem, each with the one button that fixes it. */
export function NeedsAttention({ accounts }: { accounts: AccountOverview[] }) {
  const { run, busy } = useAccountActions();
  const problems = accounts.flatMap((account) =>
    account.source.issue
      ? [{ account, copy: problemCopy(account, account.source.issue) }]
      : [],
  );
  if (problems.length === 0) {
    return (
      <Panel className="flex items-center gap-3 divide-y-0 p-5">
        <CheckCircle2
          className="size-5 shrink-0 text-emerald-300/90"
          aria-hidden
        />
        <div>
          <p className="text-13 font-medium text-white/85">All up to date</p>
          <p className="type-caption text-white/45">
            Every account is importing as it should.
          </p>
        </div>
      </Panel>
    );
  }
  return (
    <Panel className="divide-y-0 p-5">
      <p className="mb-2 flex h-8 items-center gap-2 type-label text-white/55">
        Needs attention
        <span className="rounded-full bg-amber-300/15 px-1.5 type-badge text-amber-200">
          {problems.length}
        </span>
      </p>
      <ul className="space-y-3">
        {problems.map(({ account, copy }) => (
          <li key={account.id} className="flex items-center gap-3">
            <AccountLogo account={account} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-13 font-medium text-white/85">
                {account.name}
              </p>
              <p className="type-caption text-amber-200/80">{copy.title}</p>
            </div>
            <SoftButton
              onClick={() => run(copy.action, account)}
              disabled={busy}
            >
              {copy.actionLabel}
            </SoftButton>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function groupTotals(accounts: AccountOverview[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const account of accounts) {
    if (!account.include_in_net_worth) continue;
    totals.set(
      account.currency,
      (totals.get(account.currency) ?? 0) + accountValue(account),
    );
  }
  return totals;
}

/** Accounts grouped by what they're for; the company's are a group of their own. */
export function AccountList({
  accounts,
  onOpen,
}: {
  accounts: AccountOverview[];
  onOpen: (account: AccountOverview) => void;
}) {
  return (
    <div className="space-y-5">
      {ACCOUNT_KINDS.map(({ kind, label }) => {
        const inGroup = accounts.filter((a) => accountKind(a) === kind);
        if (inGroup.length === 0) return null;
        return (
          <section key={kind} aria-label={label}>
            <div className="mb-2 flex items-baseline justify-between gap-3 pr-12 pl-5">
              <h2 className="type-section text-white/55">{label}</h2>
              <p className="type-caption text-white/45">
                {[...groupTotals(inGroup)].map(([currency, total], i) => (
                  <span key={currency}>
                    {i > 0 && " + "}
                    <Amount value={total} currency={currency} />
                  </span>
                ))}
              </p>
            </div>
            <Panel>
              {inGroup.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  onOpen={() => onOpen(account)}
                />
              ))}
            </Panel>
          </section>
        );
      })}
    </div>
  );
}

function AccountRow({
  account,
  onOpen,
}: {
  account: AccountOverview;
  onOpen: () => void;
}) {
  const needsYou = !!account.source.issue;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-start gap-3 px-5 py-3 text-left transition-colors duration-150 hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none"
    >
      <AccountLogo account={account} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-13 font-medium text-white/85">
          {account.name}
        </p>
        <p className="flex items-center gap-1.5 truncate type-caption text-white/45">
          <span className="hidden truncate @md:inline">
            {accountTypeLabel(account)}
          </span>
          <span aria-hidden className="hidden @md:inline">
            -
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1",
              needsYou && "text-amber-200/85",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                needsYou ? "bg-amber-300" : "bg-emerald-400/80",
              )}
            />
            {needsYou ? "Needs you" : "Up to date"}
          </span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <Amount
          value={accountValue(account)}
          currency={account.currency}
          className={cn(
            "text-13 font-medium",
            account.include_in_net_worth ? "text-white/85" : "text-white/45",
          )}
        />
        {!account.include_in_net_worth && (
          <p className="type-caption text-white/35">Not in net worth</p>
        )}
      </div>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-white/20 transition-colors group-hover:text-white/55" />
    </button>
  );
}

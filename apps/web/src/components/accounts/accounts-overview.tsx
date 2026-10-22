import type {
  AccountOverview,
  AccountsOverviewResponse,
  OverviewTotal,
} from "@bessel/client";
import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, ChevronRight, Trash2 } from "lucide-react";
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EditAccountDialog } from "@/components/edit-account-dialog";
import { IconButton, Panel, SectionLabel, StatTile } from "@/components/ui-kit";
import { ACCOUNT_SUBTYPES } from "@/lib/account-constants";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const LINE = "var(--color-primary-400)";
const TICK = { fill: "rgb(255 255 255 / 0.38)", fontSize: 11 };

function whole(minor: number, currency: string): string {
  return formatMoney(Math.round(minor / 100) * 100, currency).replace(
    /,00(?= )/,
    "",
  );
}

function typeLabel(subtype: string): string {
  return ACCOUNT_SUBTYPES.find((s) => s.value === subtype)?.label ?? subtype;
}

/** What an account is worth: an investment account's holdings count too. */
export function accountValue(account: AccountOverview): number {
  return (account.current_balance ?? 0) + (account.holdings_value ?? 0);
}

export function NetWorth({ totals }: { totals: OverviewTotal[] }) {
  const personal = totals.filter((t) => t.owner === "personal");
  const company = totals.filter((t) => t.owner === "company");
  return (
    <div className="space-y-3">
      {personal.map((total) => (
        <div
          key={total.currency}
          className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2"
        >
          <StatTile
            label="Net worth"
            value={whole(total.net, total.currency)}
            hint="Cash and investments, minus what you owe"
          />
          <StatTile label="Cash" value={whole(total.cash, total.currency)} />
          <StatTile
            label="Investments"
            value={whole(total.investments, total.currency)}
            hint="Holdings plus cash in them"
          />
          <StatTile
            label="Owed"
            value={whole(total.debt, total.currency)}
            hint="Klarna pay later and cards"
          />
        </div>
      ))}
      {company.map((total) => (
        <p key={total.currency} className="text-12 text-white/50">
          Your company's accounts hold{" "}
          <span className="font-medium tabular-nums text-white/75">
            {whole(total.net, total.currency)}
          </span>{" "}
          - kept out of your own net worth.
        </p>
      ))}
    </div>
  );
}

/** Personal cash accounts' month-end balances added up, in one currency. */
export function cashHistory(
  accounts: AccountOverview[],
  currency: string,
): { month: string; balance: number }[] {
  const byMonth = new Map<string, number>();
  for (const account of accounts) {
    if (account.is_business || account.currency !== currency) continue;
    if (account.group === "investments") continue;
    for (const point of account.history) {
      const month = format(point.month, "yyyy-MM-01");
      byMonth.set(month, (byMonth.get(month) ?? 0) + point.balance);
    }
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, balance]) => ({ month, balance }));
}

export function CashChart({
  accounts,
  currency,
}: {
  accounts: AccountOverview[];
  currency: string;
}) {
  const gradientId = `cash-fill-${useId().replace(/[^\w-]/g, "")}`;
  const data = cashHistory(accounts, currency);
  if (data.length < 2) return null;
  return (
    <Panel className="divide-y-0 px-4 pt-3 pb-2">
      <p className="mb-1 text-12 text-white/55">Your cash, end of each month</p>
      <div className="h-40 w-full">
        <ResponsiveContainer>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE} stopOpacity={0.28} />
                <stop offset="100%" stopColor={LINE} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.05)" />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) =>
                format(new Date(`${m}T00:00:00`), "MMM")
              }
              tickLine={false}
              axisLine={false}
              tick={TICK}
              tickMargin={6}
            />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v / 100_000)}k`}
              tickLine={false}
              axisLine={false}
              width={40}
              tick={TICK}
            />
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
                      {format(new Date(`${point.month}T00:00:00`), "MMMM yyyy")}
                    </p>
                    <p className="text-white/60">
                      {whole(point.balance, currency)}
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke={LINE}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function sourceLine(account: AccountOverview): string {
  const { source } = account;
  const parts = [typeLabel(account.subtype), source.label];
  if (source.synced_at) {
    parts.push(
      `${source.kind === "klarna" ? "imported" : "synced"} ${formatDistanceToNow(source.synced_at, { addSuffix: true })}`,
    );
  } else if (account.last_transaction) {
    parts.push(
      `last transaction ${format(account.last_transaction, "d MMM yyyy")}`,
    );
  }
  return parts.join(" - ");
}

function AccountRow({
  account,
  onDelete,
}: {
  account: AccountOverview;
  onDelete: (account: AccountOverview) => void;
}) {
  const problem = account.source.problem;
  return (
    <div className="group flex items-center gap-3 px-4 py-3">
      <Link
        to="/transactions"
        search={{ bank_account_id: [account.id] }}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-13 font-medium text-white/85">
            {account.name}
          </p>
          <p className="truncate text-11 text-white/45">
            {sourceLine(account)}
          </p>
          {problem && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-11 text-amber-300/90">
              <AlertTriangle className="size-3 shrink-0" aria-hidden />
              {problem}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-13 font-medium tabular-nums text-white/85">
            {formatMoney(accountValue(account), account.currency)}
          </p>
          {account.holdings_value != null && (
            <p className="text-11 tabular-nums text-white/40">
              {formatMoney(account.current_balance ?? 0, account.currency)} cash
            </p>
          )}
        </div>
        <ChevronRight className="size-4 shrink-0 text-white/25 transition-colors group-hover:text-white/60" />
      </Link>
      <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
        <EditAccountDialog account={account} />
        <IconButton
          destructive
          title="Delete account"
          onClick={() => onDelete(account)}
        >
          <Trash2 />
        </IconButton>
      </div>
    </div>
  );
}

const GROUPS: { owner: "personal" | "company"; title: string }[] = [
  { owner: "personal", title: "Your accounts" },
  { owner: "company", title: "Company accounts" },
];

export function AccountGroups({
  data,
  onDelete,
}: {
  data: AccountsOverviewResponse;
  onDelete: (account: AccountOverview) => void;
}) {
  return (
    <div className="space-y-5">
      {GROUPS.map(({ owner, title }) => {
        const accounts = data.accounts.filter(
          (a) => a.is_business === (owner === "company"),
        );
        if (accounts.length === 0) return null;
        const issues = accounts.filter((a) => a.source.problem).length;
        return (
          <section key={owner}>
            <SectionLabel
              action={
                issues > 0 && (
                  <span className="text-11 text-amber-300/90">
                    {issues} need{issues === 1 ? "s" : ""} attention
                  </span>
                )
              }
            >
              {title}
            </SectionLabel>
            <Panel className={cn(issues > 0 && "border-amber-300/15")}>
              {accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  onDelete={onDelete}
                />
              ))}
            </Panel>
          </section>
        );
      })}
    </div>
  );
}

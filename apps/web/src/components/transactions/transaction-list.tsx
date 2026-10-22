import type { CategorySchema, TransactionSchema } from "@bessel/client";
import { Checkbox } from "@bessel/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import { format, isToday, isYesterday } from "date-fns";
import { ArrowLeftRight, MoreHorizontal, Trash2 } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { type BulkSuggestion, CategoryCell } from "@/components/category-cell";
import { IconButton, Panel } from "@/components/ui-kit";
import { Amount } from "@/lib/privacy";
import { cn } from "@/lib/utils";

export interface TransactionHandlers {
  onOpen: (transaction: TransactionSchema) => void;
  onDelete: (ids: string[]) => void;
  onToggleBusiness: (id: string, value: boolean) => void;
  onUnpair: (id: string) => void;
  onBulkSuggestion: (suggestion: BulkSuggestion) => void;
}

/** A credit adds to the account, a debit takes from it. */
export function signedAmount(transaction: TransactionSchema): number {
  return transaction.direction === "debit"
    ? -transaction.amount
    : transaction.amount;
}

export function dayLabel(day: Date): string {
  if (isToday(day)) return "Today";
  if (isYesterday(day)) return "Yesterday";
  return format(day, "EEE d MMM");
}

interface DayGroup {
  key: string;
  day: Date;
  transactions: TransactionSchema[];
}

/** Newest first, one group per day; the list arrives sorted by date already. */
export function groupByDay(transactions: TransactionSchema[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const transaction of transactions) {
    const key = format(transaction.transaction_date, "yyyy-MM-dd");
    const last = groups.at(-1);
    if (last?.key === key) last.transactions.push(transaction);
    else {
      groups.push({
        key,
        day: new Date(`${key}T00:00:00`),
        transactions: [transaction],
      });
    }
  }
  return groups;
}

/** Each day's own money: moves between your accounts and company money left out, like the month's figures. */
function dayTotal(transactions: TransactionSchema[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.transfer_id || t.is_business) continue;
    totals.set(t.currency, (totals.get(t.currency) ?? 0) + signedAmount(t));
  }
  return totals;
}

export function TransactionList({
  transactions,
  accounts,
  categories,
  selected,
  onSelectedChange,
  handlers,
}: {
  transactions: TransactionSchema[];
  accounts: Map<string, string>;
  categories: CategorySchema[];
  selected: ReadonlySet<string>;
  onSelectedChange: (selected: Set<string>) => void;
  handlers: TransactionHandlers;
}) {
  const groups = useMemo(() => groupByDay(transactions), [transactions]);
  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const allSelected =
    transactions.length > 0 && selected.size === transactions.length;
  const selecting = selected.size > 0;
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  };

  return (
    <Panel className="divide-y-0">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2">
        <Checkbox
          checked={allSelected || (selecting && "indeterminate")}
          onCheckedChange={(on) =>
            onSelectedChange(
              on ? new Set(transactions.map((t) => t.id)) : new Set(),
            )
          }
          aria-label="Select all"
        />
        <span className="type-caption text-white/45">
          {selecting ? `${selected.size} selected` : "Select all"}
        </span>
      </div>
      {groups.map((group) => (
        <section key={group.key} aria-label={dayLabel(group.day)}>
          <div className="flex items-baseline justify-between gap-3 bg-white/[0.02] px-4 pt-3 pb-1.5">
            <h3 className="type-section text-white/50">
              {dayLabel(group.day)}
            </h3>
            <span className="type-caption text-white/40">
              {[...dayTotal(group.transactions)].map(([currency, total]) => (
                <Amount
                  key={currency}
                  value={total}
                  currency={currency}
                  sign
                  className="ml-2"
                />
              ))}
            </span>
          </div>
          <ul>
            {group.transactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                account={accounts.get(transaction.bank_account_id)}
                category={
                  transaction.category_id
                    ? byId.get(transaction.category_id)
                    : undefined
                }
                categories={categories}
                checked={selected.has(transaction.id)}
                selecting={selecting}
                onCheck={(on) => toggle(transaction.id, on)}
                handlers={handlers}
              />
            ))}
          </ul>
        </section>
      ))}
    </Panel>
  );
}

const TransactionRow = memo(function TransactionRow({
  transaction,
  account,
  category,
  categories,
  checked,
  selecting,
  onCheck,
  handlers,
}: {
  transaction: TransactionSchema;
  account: string | undefined;
  category: CategorySchema | undefined;
  categories: CategorySchema[];
  checked: boolean;
  selecting: boolean;
  onCheck: (on: boolean) => void;
  handlers: TransactionHandlers;
}) {
  const credit = transaction.direction === "credit";
  const description = transaction.description ?? "No description";
  return (
    <li
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-white/[0.03]",
        checked && "bg-primary-500/[0.06]",
      )}
    >
      {/* Out of the way until you hover or start selecting; a tap on a phone opens the transaction instead. */}
      <Checkbox
        checked={checked}
        onCheckedChange={(on) => onCheck(!!on)}
        aria-label={`Select ${description}`}
        className={cn(
          "hidden shrink-0 @2xl:flex",
          !selecting &&
            !checked &&
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          selecting && "flex",
        )}
      />
      <TransactionIcon
        logo={transaction.logo_url}
        category={category}
        transfer={!!transaction.transfer_id}
      />
      <button
        type="button"
        onClick={() => handlers.onOpen(transaction)}
        className="min-w-0 flex-1 text-left focus-visible:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-13 font-medium text-white/85">
            {description}
          </span>
          {transaction.is_business && (
            <span className="shrink-0 rounded-md border border-primary-500/25 bg-primary-500/10 px-1.5 type-badge text-primary-300">
              Company
            </span>
          )}
        </span>
        <span className="block truncate type-caption text-white/45">
          {account ?? "Unknown account"}
          <span className="@2xl:hidden">
            {" - "}
            {transaction.transfer_id
              ? "Between your accounts"
              : (category?.name ?? "No category")}
          </span>
        </span>
      </button>
      <div className="hidden w-44 shrink-0 @2xl:block">
        {transaction.transfer_id ? (
          <span className="type-caption text-white/40">
            Between your accounts
          </span>
        ) : (
          <CategoryCell
            transactionId={transaction.id}
            categoryId={transaction.category_id}
            description={transaction.description}
            categories={categories}
            onBulkSuggestion={handlers.onBulkSuggestion}
          />
        )}
      </div>
      <Amount
        value={signedAmount(transaction)}
        currency={transaction.currency}
        sign
        exact
        className={cn(
          "w-28 shrink-0 text-right text-13 font-medium",
          credit ? "text-income" : "text-white/80",
        )}
      />
      <div className="hidden shrink-0 @2xl:block">
        <RowMenu transaction={transaction} handlers={handlers} />
      </div>
    </li>
  );
});

/** The merchant's logo when the source gave one, otherwise the category's colour and initial. */
export function TransactionIcon({
  logo,
  category,
  transfer,
}: {
  logo?: string | null;
  category: CategorySchema | undefined;
  transfer: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (logo && !broken) {
    return (
      <span className="flex size-8 shrink-0 overflow-hidden rounded-full bg-white">
        <img
          src={logo}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setBroken(true)}
        />
      </span>
    );
  }
  if (transfer) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/50">
        <ArrowLeftRight className="size-3.5" aria-hidden />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-12 font-medium"
      style={
        category
          ? {
              backgroundColor: `color-mix(in srgb, ${category.color} 18%, transparent)`,
              color: category.color,
            }
          : undefined
      }
    >
      {category ? (
        category.name.slice(0, 1)
      ) : (
        <span className="size-2 rounded-full bg-white/25" />
      )}
    </span>
  );
}

export function RowMenu({
  transaction,
  handlers,
}: {
  transaction: TransactionSchema;
  handlers: TransactionHandlers;
}) {
  const business = transaction.is_business ?? false;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          aria-label={`More for ${transaction.description ?? "transaction"}`}
        >
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handlers.onToggleBusiness(transaction.id, !business)}
        >
          {business ? "Not a company expense" : "Company expense"}
        </DropdownMenuItem>
        {transaction.transfer_id && (
          <DropdownMenuItem onClick={() => handlers.onUnpair(transaction.id)}>
            Not a transfer
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
          onClick={() => handlers.onDelete([transaction.id])}
        >
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

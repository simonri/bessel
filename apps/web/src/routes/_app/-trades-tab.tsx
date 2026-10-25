import type { TradeSchema } from "@bessel/client";
import { listTradesOptions } from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Minus, Plus, TrendingUp } from "lucide-react";
import { useState } from "react";
import {
  EmptyState,
  Panel,
  PeriodNav,
  placeholderKeys,
} from "@/components/ui-kit";
import { client } from "@/lib/client";
import { formatQuantity } from "@/lib/money";
import { Amount } from "@/lib/privacy";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 30;

/** What the trade came to: units are millionths, prices minor units. */
export function tradeTotal(trade: TradeSchema): number {
  return Math.round((trade.quantity * trade.price_per_unit) / 1_000_000);
}

/** Newest first, one group per month; the list arrives sorted by date already. */
export function groupByMonth(
  trades: TradeSchema[],
): { key: string; label: string; trades: TradeSchema[] }[] {
  const groups: { key: string; label: string; trades: TradeSchema[] }[] = [];
  for (const trade of trades) {
    const key = format(trade.trade_date, "yyyy-MM");
    const last = groups.at(-1);
    if (last?.key === key) last.trades.push(trade);
    else {
      groups.push({
        key,
        label: format(trade.trade_date, "MMMM yyyy"),
        trades: [trade],
      });
    }
  }
  return groups;
}

export function TradesTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    ...listTradesOptions({
      client,
      query: { page, limit: PAGE_SIZE },
    }),
    placeholderData: keepPreviousData,
  });

  const trades = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {placeholderKeys(6).map((key) => (
          <Skeleton
            key={key}
            className="h-12 w-full rounded-lg bg-white/[0.06]"
          />
        ))}
      </div>
    );
  }
  if (trades.length === 0) {
    return (
      <EmptyState icon={<TrendingUp />} title="Nothing bought or sold yet">
        Buys and sells show up here once Avanza has synced.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="divide-y-0">
        {groupByMonth(trades).map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h3 className="bg-white/[0.02] px-5 pt-3 pb-1.5 type-section text-white/50">
              {group.label}
            </h3>
            <ul>
              {group.trades.map((trade) => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </ul>
          </section>
        ))}
      </Panel>
      {maxPage > 1 && (
        <div className="flex justify-end">
          <PeriodNav
            label={`${page} / ${maxPage}`}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(maxPage, p + 1))}
            prevDisabled={page <= 1}
            nextDisabled={page >= maxPage}
          />
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade }: { trade: TradeSchema }) {
  const buy = trade.trade_type === "buy";
  const Icon = buy ? Plus : Minus;
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          buy
            ? "bg-primary-500/15 text-primary-300"
            : "bg-emerald-400/10 text-emerald-300",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-13 font-medium text-white/85">
          {buy ? "Bought" : "Sold"} {trade.security_name}
        </p>
        <p className="truncate type-caption text-white/45">
          {format(trade.trade_date, "d MMM")} - {formatQuantity(trade.quantity)}{" "}
          ×{" "}
          <Amount
            value={trade.price_per_unit}
            currency={trade.currency}
            exact
          />{" "}
          - {trade.bank_account_name}
        </p>
      </div>
      <Amount
        value={buy ? -tradeTotal(trade) : tradeTotal(trade)}
        currency={trade.currency}
        sign
        exact
        className={cn(
          "shrink-0 text-13 font-medium",
          buy ? "text-white/80" : "text-income",
        )}
      />
    </li>
  );
}

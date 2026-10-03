import { Skeleton } from "@bessel/ui/components/skeleton";
import { type SpotBalance, spotValue } from "@/lib/hyperliquid";
import { formatAmount, formatUsd } from "@/routes/_app/-hyperliquid-format";
import { CoinBadge } from "./coin-badge";

export function SpotList({
  spot,
  mids,
}: {
  spot: SpotBalance[] | undefined;
  mids: Record<string, number> | undefined;
}) {
  if (!spot) {
    return <Skeleton className="h-28 rounded-2xl bg-white/[0.04]" />;
  }
  const rows = spot
    .map((balance) => ({ balance, value: spotValue(balance, mids) }))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.03] px-4 py-6 text-center ring-1 ring-white/[0.06]">
        <p className="text-sm font-medium text-white/75">No spot balances</p>
        <p className="mt-0.5 text-xs text-white/40">
          Coins you hold outright land here.
        </p>
      </div>
    );
  }
  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-white/[0.03] p-2 ring-1 ring-white/[0.06]">
      {rows.map(({ balance, value }) => (
        <div
          key={balance.coin}
          className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-white/[0.04]"
        >
          <CoinBadge coin={balance.coin} className="size-7" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 tabular-nums">
              <span className="truncate text-13 font-medium text-white/85">
                {balance.coin}
                <span className="ml-1.5 text-11 font-normal text-white/40">
                  {formatAmount(balance.total)}
                  {balance.hold > 0 && ` - ${formatAmount(balance.hold)} held`}
                </span>
              </span>
              <span className="shrink-0 text-13 text-white/80">
                {value === null ? "—" : formatUsd(value)}
              </span>
            </div>
            {value !== null && total > 0 && (
              <span
                aria-hidden
                className="h-1 overflow-hidden rounded-full bg-white/[0.06]"
              >
                <span
                  className="block h-full rounded-full bg-primary-400/50"
                  style={{ width: `${(value / total) * 100}%` }}
                />
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

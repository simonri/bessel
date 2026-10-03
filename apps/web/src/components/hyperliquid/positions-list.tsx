import { Skeleton } from "@bessel/ui/components/skeleton";
import { atMark, type PerpState, type Position } from "@/lib/hyperliquid";
import { cn } from "@/lib/utils";
import {
  formatAmount,
  formatPercent,
  formatPrice,
  formatSignedUsd,
  formatUsd,
  liquidationDistance,
  pnlTone,
} from "@/routes/_app/-hyperliquid-format";
import { CoinBadge } from "./coin-badge";

export function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className="flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2 py-px text-11 font-medium text-white/55 ring-1 ring-white/[0.06]"
      title={
        live
          ? "Streaming from Hyperliquid"
          : "Reconnecting; refreshing every minute meanwhile"
      }
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          live ? "bg-emerald-300 motion-safe:animate-pulse" : "bg-white/25",
        )}
      />
      {live ? "Live" : "Reconnecting"}
    </span>
  );
}

// Below 10% the position is one sharp move from liquidation.
function liquidationTone(distance: number): string {
  if (distance < 0.1) return "bg-rose-300";
  if (distance < 0.25) return "bg-amber-300";
  return "bg-emerald-300/80";
}

function LiquidationMeter({
  mark,
  liquidationPrice,
}: {
  mark: number | undefined;
  liquidationPrice: number | null;
}) {
  const distance = liquidationDistance(mark, liquidationPrice);
  if (liquidationPrice === null) {
    return <span className="text-white/35">No liquidation price</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-white/40">Liq.</span>
      <span className="text-white/65">{formatPrice(liquidationPrice)}</span>
      {distance !== null && (
        <>
          <span
            aria-hidden
            className="h-1 w-10 overflow-hidden rounded-full bg-white/10"
          >
            <span
              className={cn(
                "block h-full rounded-full",
                liquidationTone(distance),
              )}
              // Half the mark away already reads as "far".
              style={{ width: `${Math.min(1, distance / 0.5) * 100}%` }}
            />
          </span>
          <span className="text-white/40">
            {Math.round(distance * 100)}% away
          </span>
        </>
      )}
    </span>
  );
}

function PositionCard({
  position,
  mark,
}: {
  position: Position;
  mark: number | undefined;
}) {
  const p = atMark(position, mark);
  const long = p.size >= 0;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06] transition-colors duration-200 hover:bg-white/[0.06]">
      <CoinBadge coin={p.coin} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-13 font-semibold text-white/90">{p.coin}</span>
          <span
            className={cn(
              "rounded-full px-2 py-px text-10 font-semibold",
              long
                ? "bg-emerald-300/15 text-emerald-200"
                : "bg-rose-300/15 text-rose-200",
            )}
          >
            {long ? "Long" : "Short"} {p.leverage}×
          </span>
          <span className="truncate text-11 tabular-nums text-white/45">
            {formatAmount(Math.abs(p.size))} {p.coin} - {formatUsd(p.value)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-11 tabular-nums">
          <span className="text-white/40">
            {formatPrice(p.entryPrice)} →{" "}
            <span className="text-white/70">
              {mark === undefined ? "—" : formatPrice(mark)}
            </span>
          </span>
          <LiquidationMeter mark={mark} liquidationPrice={p.liquidationPrice} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
        <span className={cn("text-13 font-semibold", pnlTone(p.unrealizedPnl))}>
          {formatSignedUsd(p.unrealizedPnl)}
        </span>
        <span className={cn("text-11", pnlTone(p.unrealizedPnl), "opacity-75")}>
          {formatPercent(p.returnOnEquity)}
        </span>
      </div>
    </div>
  );
}

export function PositionsList({
  perp,
  marks,
}: {
  perp: PerpState | undefined;
  marks: Record<string, number>;
}) {
  if (!perp) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
    );
  }
  if (perp.positions.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.03] px-4 py-6 text-center ring-1 ring-white/[0.06]">
        <p className="text-sm font-medium text-white/75">
          No open positions ☕
        </p>
        <p className="mt-0.5 text-xs text-white/40">
          Enjoying the calm. New trades show up here live.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {perp.positions.map((position) => (
        <PositionCard
          key={position.coin}
          position={position}
          mark={marks[position.coin]}
        />
      ))}
    </div>
  );
}

/** Unrealized PnL across positions, at the latest marks. */
export function totalUnrealized(
  perp: PerpState | undefined,
  marks: Record<string, number>,
): number | null {
  if (!perp?.positions.length) return null;
  return perp.positions.reduce(
    (sum, p) => sum + atMark(p, marks[p.coin]).unrealizedPnl,
    0,
  );
}

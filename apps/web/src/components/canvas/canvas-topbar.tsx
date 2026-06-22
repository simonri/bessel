import { useQuery } from "@tanstack/react-query";
import { getCryptoPriceV1InvestmentsCryptoPriceCoinIdGetOptions } from "@metron/client";
import { client } from "@/lib/client";
import { TrendingUp, TrendingDown } from "lucide-react";

export function CanvasTopBar() {
  const { data } = useQuery({
    ...getCryptoPriceV1InvestmentsCryptoPriceCoinIdGetOptions({
      client,
      path: { coin_id: "bitcoin" },
      query: { currency: "usd" },
    }),
    refetchInterval: 30_000,
  });

  const formatted =
    data?.price != null
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(data.price)
      : null;

  const pct = data?.price_change_pct_24h ?? null;
  const isPositive = pct !== null && pct >= 0;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-end gap-2 border-b border-white/10 bg-black/40 px-4 py-1 backdrop-blur-xl">
      <span className="text-[11px] font-mono text-orange-400/60 tracking-wide">BTCUSDT</span>
      <span className="text-[11px] font-mono font-medium text-white/70 tabular-nums">{formatted ?? "—"}</span>
      {pct !== null && (
        <span className={`flex items-center gap-0.5 text-[11px] font-mono tabular-nums ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
          {isPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {isPositive ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

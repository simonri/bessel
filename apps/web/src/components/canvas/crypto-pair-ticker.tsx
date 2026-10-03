import { getCryptoPriceV1InvestmentsCryptoPriceCoinIdGetOptions } from "@bessel/client";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp } from "lucide-react";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";

// Map trading pair symbols to CoinGecko IDs and quote currencies
const QUOTE_SUFFIXES: [string, string][] = [
  ["USDT", "usd"],
  ["USDC", "usd"],
  ["BUSD", "usd"],
  ["USD", "usd"],
  ["EUR", "eur"],
  ["BTC", "btc"],
  ["ETH", "eth"],
];

const SYMBOL_TO_COIN_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  MATIC: "matic-network",
  ATOM: "cosmos",
  LTC: "litecoin",
  UNI: "uniswap",
  NEAR: "near",
  ARB: "arbitrum",
  OP: "optimism",
  APT: "aptos",
  SUI: "sui",
};

function parsePair(pair: string): { coinId: string; currency: string } | null {
  const upper = pair.toUpperCase();
  for (const [quote, currency] of QUOTE_SUFFIXES) {
    if (upper.endsWith(quote)) {
      const base = upper.slice(0, upper.length - quote.length);
      const coinId = SYMBOL_TO_COIN_ID[base];
      if (coinId) return { coinId, currency };
    }
  }
  return null;
}

// Intl.NumberFormat construction is expensive — share one instance.
const USD_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function CryptoPairTicker({ pair }: { pair: string }) {
  const parsed = parsePair(pair);

  const { data } = useQuery({
    ...getCryptoPriceV1InvestmentsCryptoPriceCoinIdGetOptions({
      client,
      path: { coin_id: parsed?.coinId ?? "" },
      query: { currency: parsed?.currency ?? "usd" },
    }),
    refetchInterval: 30_000,
    enabled: !!parsed,
  });

  if (!parsed) return null;

  const formatted = data?.price != null ? USD_FORMAT.format(data.price) : null;

  const pct = data?.price_change_pct_24h ?? null;
  const isPositive = pct !== null && pct >= 0;

  return (
    <div className="flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 ring-1 ring-white/[0.06]">
      <span className="text-10 font-semibold tracking-wide text-white/45">
        {pair}
      </span>
      {formatted === null ? (
        <span className="h-2 w-12 animate-pulse rounded-full bg-white/10">
          <span className="sr-only">Loading price</span>
        </span>
      ) : (
        <span className="text-11 font-medium tabular-nums text-white/85">
          {formatted}
        </span>
      )}
      {pct !== null && (
        <span
          className={cn(
            "flex items-center gap-0.5 text-10 font-medium tabular-nums",
            isPositive ? "text-emerald-400/90" : "text-rose-400/90",
          )}
        >
          {isPositive ? (
            <TrendingUp className="size-2.5" />
          ) : (
            <TrendingDown className="size-2.5" />
          )}
          {isPositive ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

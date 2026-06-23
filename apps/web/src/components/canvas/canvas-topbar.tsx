import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, Settings, Timer, TrendingDown, TrendingUp } from "lucide-react";
import {
  getCryptoPriceV1InvestmentsCryptoPriceCoinIdGetOptions,
  listNotificationsV1NotificationsGetOptions,
  listNotificationsV1NotificationsGetQueryKey,
  markAllNotificationsReadV1NotificationsReadAllPost,
  markNotificationReadV1NotificationsNotificationIdReadPost,
} from "@metron/client";
import { Popover, PopoverContent, PopoverTrigger } from "@metron/ui/components/popover";
import { client } from "@/lib/client";
import { useSettings } from "@/hooks/use-settings";
import { SettingsModal } from "@/components/settings-modal";
import { Counters } from "@/routes/_app/counters";

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

function CryptoPairTicker({ pair }: { pair: string }) {
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

  const formatted =
    data?.price != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(data.price)
      : null;

  const pct = data?.price_change_pct_24h ?? null;
  const isPositive = pct !== null && pct >= 0;

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[11px] tracking-wide text-orange-400/60">{pair}</span>
      <span className="font-mono text-[11px] font-medium tabular-nums text-white/70">
        {formatted ?? "—"}
      </span>
      {pct !== null && (
        <span
          className={`flex items-center gap-0.5 font-mono text-[11px] tabular-nums ${
            isPositive ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {isPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {isPositive ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

function TimeSinceDropdown() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70">
          <Timer className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="h-80 w-72 overflow-hidden rounded-xl border-white/10 bg-black/60 p-0 shadow-2xl backdrop-blur-xl"
      >
        <Counters />
      </PopoverContent>
    </Popover>
  );
}

function NotificationBell() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...listNotificationsV1NotificationsGetOptions({ client }),
    refetchInterval: 30_000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unread_count ?? 0;

  const markRead = useMutation({
    mutationFn: (id: string) =>
      markNotificationReadV1NotificationsNotificationIdReadPost({
        client,
        path: { notification_id: id },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: listNotificationsV1NotificationsGetQueryKey({ client }),
      }),
  });

  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsReadV1NotificationsReadAllPost({ client }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: listNotificationsV1NotificationsGetQueryKey({ client }),
      }),
  });

  const kindColor: Record<string, string> = {
    info: "bg-sky-400",
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    error: "bg-red-400",
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold leading-none text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex w-80 flex-col overflow-hidden rounded-xl border-white/10 bg-black/60 p-0 shadow-2xl backdrop-blur-xl"
        style={{ maxHeight: "min(28rem, 80vh)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="text-sm font-medium text-white/80">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="text-[11px] text-sky-400 transition-colors hover:text-sky-300"
            >
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="py-8 text-center text-xs text-white/30">No notifications</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="divide-y divide-white/[0.06]">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read_at) markRead.mutate(n.id);
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.04] ${
                    n.read_at ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        n.read_at ? "bg-white/20" : (kindColor[n.kind] ?? "bg-sky-400")
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-snug text-white/80">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 text-[11px] leading-snug text-white/40">{n.body}</p>
                      )}
                      <p className="mt-1 text-[10px] text-white/25">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function CanvasTopBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings } = useSettings();

  const pairs = settings.cryptoPairs
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return (
    <div className="fixed left-0 right-0 top-0 z-50 flex items-center border-b border-white/10 bg-black/40 px-4 py-1 backdrop-blur-xl">
      <div className="flex min-w-0 flex-1 items-center gap-6">
        {pairs.map((pair) => (
          <CryptoPairTicker key={pair} pair={pair} />
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <TimeSinceDropdown />
        <NotificationBell />
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70"
        >
          <Settings className="size-4" />
        </button>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

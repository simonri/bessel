import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, TrendingUp, TrendingDown } from "lucide-react";
import {
  getCryptoPriceV1InvestmentsCryptoPriceCoinIdGetOptions,
  listNotificationsV1NotificationsGetOptions,
  listNotificationsV1NotificationsGetQueryKey,
  markNotificationReadV1NotificationsNotificationIdReadPost,
  markAllNotificationsReadV1NotificationsReadAllPost,
} from "@metron/client";
import { Popover, PopoverContent, PopoverTrigger } from "@metron/ui/components/popover";
import { ScrollArea } from "@metron/ui/components/scroll-area";
import { client } from "@/lib/client";

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
    mutationFn: () =>
      markAllNotificationsReadV1NotificationsReadAllPost({ client }),
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
        className="flex w-80 flex-col overflow-hidden p-0 border-white/10 bg-black/80 backdrop-blur-xl"
        style={{ maxHeight: "min(28rem, 80vh)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="text-sm font-medium text-white/80">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="py-8 text-center text-xs text-white/30">No notifications</div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
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
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

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
      <NotificationBell />
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

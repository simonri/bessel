import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  fetchPerpState,
  parsePerpState,
  type RawPerpState,
} from "@/lib/hyperliquid";

// Hyperliquid's WebSocket pushes an account's perp state as it changes and
// each coin's mark price about once a second, so position PnL can follow the
// market without polling.
const WS_URL = "wss://api.hyperliquid.xyz/ws";
// The server drops connections that go a minute without a message.
const PING_MS = 30_000;
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;
// Only while the socket is down.
const POLL_MS = 60_000;
// Marks arrive about once a second per coin; an account with many positions
// would otherwise re-render on every one.
const MARK_FLUSH_MS = 250;

export type LiveStatus = "connecting" | "live" | "offline";

type Subscription =
  | { type: "clearinghouseState"; user: string }
  | { type: "activeAssetCtx"; coin: string };

type Message =
  | {
      channel: "clearinghouseState";
      data: { user: string; clearinghouseState: RawPerpState };
    }
  | {
      channel: "activeAssetCtx";
      data: { coin: string; ctx: { markPx: string } };
    }
  | { channel: "subscriptionResponse" | "pong" | "error"; data: unknown };

function message(
  method: "subscribe" | "unsubscribe",
  subscription: Subscription,
): string {
  return JSON.stringify({ method, subscription });
}

/** `user`'s perp state (positions, margin) kept current over Hyperliquid's
 *  WebSocket, with live mark prices for each open position's coin. While the
 *  socket is down it reconnects with backoff and polls instead. */
export function useHyperliquidPerp(user: string) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [marks, setMarks] = useState<Record<string, number>>({});
  const queryKey = ["hyperliquid", "perp", user];
  const { data: perp } = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchPerpState(user, signal),
    refetchInterval: status === "live" ? false : POLL_MS,
  });

  const socketRef = useRef<WebSocket | null>(null);
  // Coins whose marks the open socket is subscribed to.
  const subscribedRef = useRef(new Set<string>());
  const coinKey = [...new Set(perp?.positions.map((p) => p.coin))]
    .sort()
    .join(",");
  const coinKeyRef = useRef(coinKey);
  coinKeyRef.current = coinKey;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryMs = RETRY_MIN_MS;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const key = ["hyperliquid", "perp", user];
    let pendingMarks: Record<string, number> = {};
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flushMarks = () => {
      flushTimer = undefined;
      const batch = pendingMarks;
      pendingMarks = {};
      setMarks((prev) =>
        Object.entries(batch).some(([coin, mark]) => prev[coin] !== mark)
          ? { ...prev, ...batch }
          : prev,
      );
    };

    const connect = () => {
      setStatus("connecting");
      const ws = new WebSocket(WS_URL);
      socket = ws;
      socketRef.current = ws;
      subscribedRef.current = new Set();

      ws.onopen = () => {
        retryMs = RETRY_MIN_MS;
        setStatus("live");
        ws.send(message("subscribe", { type: "clearinghouseState", user }));
        for (const coin of coinKeyRef.current.split(",").filter(Boolean)) {
          ws.send(message("subscribe", { type: "activeAssetCtx", coin }));
          subscribedRef.current.add(coin);
        }
        pingTimer = setInterval(
          () => ws.send(JSON.stringify({ method: "ping" })),
          PING_MS,
        );
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as Message;
        if (msg.channel === "clearinghouseState") {
          if (msg.data.user.toLowerCase() !== user) return;
          queryClient.setQueryData(
            key,
            parsePerpState(msg.data.clearinghouseState),
          );
        } else if (msg.channel === "activeAssetCtx") {
          pendingMarks[msg.data.coin] = Number(msg.data.ctx.markPx);
          flushTimer ??= setTimeout(flushMarks, MARK_FLUSH_MS);
        }
      };
      ws.onclose = () => {
        clearInterval(pingTimer);
        if (socketRef.current === ws) socketRef.current = null;
        if (closed) return;
        setStatus("offline");
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
      };
      // An error is always followed by close, which retries.
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      clearTimeout(flushTimer);
      clearInterval(pingTimer);
      socket?.close();
      socketRef.current = null;
      setMarks({});
    };
  }, [user, queryClient]);

  // Follow the open positions: subscribe to new coins' marks, drop old ones.
  // `status` is a dependency so a fresh connection catches up too.
  useEffect(() => {
    const socket = socketRef.current;
    if (status !== "live" || socket?.readyState !== WebSocket.OPEN) return;
    const wanted = new Set(coinKey.split(",").filter(Boolean));
    const subscribed = subscribedRef.current;
    for (const coin of wanted) {
      if (subscribed.has(coin)) continue;
      socket.send(message("subscribe", { type: "activeAssetCtx", coin }));
      subscribed.add(coin);
    }
    for (const coin of subscribed) {
      if (wanted.has(coin)) continue;
      socket.send(message("unsubscribe", { type: "activeAssetCtx", coin }));
      subscribed.delete(coin);
    }
  }, [coinKey, status]);

  return { perp, marks, status };
}

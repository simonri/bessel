// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { atMark, type Position } from "./hyperliquid";
import { STALE_MS, useHyperliquidPerp } from "./hyperliquid-live";

const USER = "0x31ca8395cf837de08b24da3f660e77761dfb974b";

/** Stands in for the browser WebSocket; the test drives it. */
class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  push(channel: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ channel, data }) });
  }
  subscriptions() {
    return this.sent.filter(
      (m): m is { method: string; subscription: Record<string, string> } =>
        (m as { method?: string }).method !== "ping",
    );
  }
}

function rawState(coins: { coin: string; szi: string }[]) {
  return {
    marginSummary: { accountValue: "1000", totalMarginUsed: "100" },
    withdrawable: "900",
    assetPositions: coins.map(({ coin, szi }) => ({
      position: {
        coin,
        szi,
        entryPx: "100",
        positionValue: "1000",
        unrealizedPnl: "0",
        returnOnEquity: "0",
        liquidationPx: null,
        leverage: { type: "cross", value: 10 },
      },
    })),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  fetchMock = vi.fn(async () =>
    Response.json(rawState([{ coin: "BTC", szi: "-2" }])),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function render() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useHyperliquidPerp(USER), { wrapper });
}

describe("atMark", () => {
  const short: Position = {
    coin: "BTC",
    size: -0.63684,
    entryPrice: 85076.2,
    value: 54088.09,
    unrealizedPnl: 0,
    returnOnEquity: 0,
    liquidationPrice: null,
    leverage: 20,
    leverageType: "cross",
  };

  it("values a position at the mark the way Hyperliquid does", () => {
    // Hyperliquid reported 91.88 PnL and 3.39% ROE at this mark.
    const live = atMark(short, 84931.92);
    expect(live.unrealizedPnl).toBeCloseTo(91.88, 1);
    expect(live.returnOnEquity).toBeCloseTo(0.0339, 3);
    expect(live.value).toBeCloseTo(54088.1, 0);
  });

  it("leaves the position alone without a mark", () => {
    expect(atMark(short, undefined)).toBe(short);
  });
});

describe("useHyperliquidPerp", () => {
  it("streams the account and the marks of its open positions", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.perp?.positions).toHaveLength(1));
    const socket = FakeSocket.instances[0];
    act(() => socket.open());
    expect(result.current.status).toBe("live");

    await waitFor(() =>
      expect(socket.subscriptions().map((m) => m.subscription)).toEqual([
        { type: "clearinghouseState", user: USER },
        { type: "activeAssetCtx", coin: "BTC" },
      ]),
    );

    // Marks within one flush window land as a single update, latest wins.
    act(() => {
      socket.push("activeAssetCtx", { coin: "BTC", ctx: { markPx: "95" } });
      socket.push("activeAssetCtx", { coin: "BTC", ctx: { markPx: "95.5" } });
    });
    expect(result.current.marks).toEqual({});
    await waitFor(() => expect(result.current.marks).toEqual({ BTC: 95.5 }));

    // The account changes: BTC closed, ETH opened.
    act(() =>
      socket.push("clearinghouseState", {
        user: USER,
        clearinghouseState: rawState([{ coin: "ETH", szi: "3" }]),
      }),
    );
    await waitFor(() =>
      expect(result.current.perp?.positions.map((p) => p.coin)).toEqual([
        "ETH",
      ]),
    );
    await waitFor(() =>
      expect(socket.subscriptions().slice(2)).toEqual([
        {
          method: "subscribe",
          subscription: { type: "activeAssetCtx", coin: "ETH" },
        },
        {
          method: "unsubscribe",
          subscription: { type: "activeAssetCtx", coin: "BTC" },
        },
      ]),
    );
  });

  it("ignores another account's updates", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.perp).toBeDefined());
    const socket = FakeSocket.instances[0];
    act(() => socket.open());
    act(() =>
      socket.push("clearinghouseState", {
        user: "0x0000000000000000000000000000000000000001",
        clearinghouseState: rawState([]),
      }),
    );
    // Cache updates reach React asynchronously; give one the chance to land.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(result.current.perp?.positions).toHaveLength(1);
  });

  it("reconnects with backoff and resubscribes", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.perp).toBeDefined());
    vi.useFakeTimers();
    act(() => FakeSocket.instances[0].open());
    act(() => FakeSocket.instances[0].close());
    expect(result.current.status).toBe("offline");

    act(() => vi.advanceTimersByTime(1_000));
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => FakeSocket.instances[1].open());
    expect(result.current.status).toBe("live");
    expect(
      FakeSocket.instances[1].subscriptions().map((m) => m.subscription),
    ).toEqual([
      { type: "clearinghouseState", user: USER },
      { type: "activeAssetCtx", coin: "BTC" },
    ]);
  });

  it("keeps backing off while sockets open but never deliver data", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.perp).toBeDefined());
    vi.useFakeTimers();
    act(() => FakeSocket.instances[0].open());
    act(() => FakeSocket.instances[0].close());

    act(() => vi.advanceTimersByTime(1_000));
    act(() => FakeSocket.instances[1].open());
    act(() => FakeSocket.instances[1].close());
    act(() => vi.advanceTimersByTime(1_000));
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1_000));
    expect(FakeSocket.instances).toHaveLength(3);

    // Data resets the backoff.
    act(() => FakeSocket.instances[2].open());
    act(() =>
      FakeSocket.instances[2].push("clearinghouseState", {
        user: USER,
        clearinghouseState: rawState([]),
      }),
    );
    act(() => FakeSocket.instances[2].close());
    act(() => vi.advanceTimersByTime(1_000));
    expect(FakeSocket.instances).toHaveLength(4);
  });

  it("reconnects when a connection goes quiet", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.perp).toBeDefined());
    vi.useFakeTimers();
    const socket = FakeSocket.instances[0];
    // Closing a dead socket doesn't report back; liveness can't wait for it.
    socket.close = () => {
      socket.readyState = 3;
    };
    act(() => socket.open());

    act(() => vi.advanceTimersByTime(STALE_MS - 1));
    expect(result.current.status).toBe("live");
    act(() => vi.advanceTimersByTime(1));
    expect(socket.readyState).toBe(3);
    expect(result.current.status).toBe("offline");

    act(() => vi.advanceTimersByTime(1_000));
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("skips messages that aren't JSON", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.perp).toBeDefined());
    const socket = FakeSocket.instances[0];
    act(() => socket.open());
    expect(() =>
      act(() => socket.onmessage?.({ data: "not json" })),
    ).not.toThrow();
    expect(result.current.status).toBe("live");
  });

  it("closes the socket on unmount", async () => {
    const { result, unmount } = render();
    await waitFor(() => expect(result.current.perp).toBeDefined());
    const socket = FakeSocket.instances[0];
    act(() => socket.open());
    unmount();
    expect(socket.readyState).toBe(3);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

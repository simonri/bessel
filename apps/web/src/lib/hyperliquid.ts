// Read-only client for Hyperliquid's public info API. Everything it returns
// is public for any address, so no key or signing is involved, and the API
// allows browser requests directly.

const INFO_URL = "https://api.hyperliquid.xyz/info";

export const ADDRESS_PATTERN = /0x[0-9a-fA-F]{40}/;

/** The address in a pasted address or explorer link (hypurrscan, app.hyperliquid.xyz…). */
export function parseAddress(input: string): string | null {
  const match = input.trim().match(ADDRESS_PATTERN);
  return match ? match[0].toLowerCase() : null;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function explorerUrl(address: string): string {
  return `https://hypurrscan.io/address/${address}`;
}

async function info<T>(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid responded ${response.status}`);
  }
  return (await response.json()) as T;
}

export const RANGES = ["day", "week", "month", "allTime"] as const;
export type Range = (typeof RANGES)[number];
export type Scope = "total" | "perp";

export interface Point {
  ts: number;
  value: number;
}

export interface PortfolioSeries {
  value: Point[];
  pnl: Point[];
  volume: number;
}

/** Keyed "day", "week"…, and "perpDay", "perpWeek"… for perps only. */
export type Portfolio = Record<string, PortfolioSeries>;

type RawSeries = {
  accountValueHistory: [number, string][];
  pnlHistory: [number, string][];
  vlm: string;
};

const points = (raw: [number, string][]): Point[] =>
  raw.map(([ts, value]) => ({ ts, value: Number(value) }));

export async function fetchPortfolio(
  user: string,
  signal?: AbortSignal,
): Promise<Portfolio> {
  const raw = await info<[string, RawSeries][]>(
    { type: "portfolio", user },
    signal,
  );
  return Object.fromEntries(
    raw.map(([key, series]) => [
      key,
      {
        value: points(series.accountValueHistory),
        pnl: points(series.pnlHistory),
        volume: Number(series.vlm),
      },
    ]),
  );
}

export function portfolioKey(range: Range, scope: Scope): string {
  return scope === "total"
    ? range
    : `perp${range[0].toUpperCase()}${range.slice(1)}`;
}

/** Latest account value: the end of the shortest history. */
export function currentValue(portfolio: Portfolio | undefined): number | null {
  return portfolio?.day?.value.at(-1)?.value ?? null;
}

export interface SubAccount {
  name: string;
  address: string;
}

export async function fetchSubAccounts(
  user: string,
  signal?: AbortSignal,
): Promise<SubAccount[]> {
  // null for an address with no sub-accounts (or that is one).
  const raw = await info<{ name: string; subAccountUser: string }[] | null>(
    { type: "subAccounts", user },
    signal,
  );
  return (raw ?? []).map((s) => ({
    name: s.name,
    address: s.subAccountUser.toLowerCase(),
  }));
}

export interface Position {
  coin: string;
  /** Signed: negative is short. */
  size: number;
  entryPrice: number;
  value: number;
  unrealizedPnl: number;
  returnOnEquity: number;
  liquidationPrice: number | null;
  leverage: number;
  leverageType: string;
}

export interface PerpState {
  accountValue: number;
  withdrawable: number;
  marginUsed: number;
  positions: Position[];
}

type RawPerpState = {
  marginSummary: { accountValue: string; totalMarginUsed: string };
  withdrawable: string;
  assetPositions: {
    position: {
      coin: string;
      szi: string;
      entryPx: string;
      positionValue: string;
      unrealizedPnl: string;
      returnOnEquity: string;
      liquidationPx: string | null;
      leverage: { type: string; value: number };
    };
  }[];
};

export async function fetchPerpState(
  user: string,
  signal?: AbortSignal,
): Promise<PerpState> {
  const raw = await info<RawPerpState>(
    { type: "clearinghouseState", user },
    signal,
  );
  return {
    accountValue: Number(raw.marginSummary.accountValue),
    withdrawable: Number(raw.withdrawable),
    marginUsed: Number(raw.marginSummary.totalMarginUsed),
    positions: raw.assetPositions.map(({ position: p }) => ({
      coin: p.coin,
      size: Number(p.szi),
      entryPrice: Number(p.entryPx),
      value: Number(p.positionValue),
      unrealizedPnl: Number(p.unrealizedPnl),
      returnOnEquity: Number(p.returnOnEquity),
      liquidationPrice:
        p.liquidationPx === null ? null : Number(p.liquidationPx),
      leverage: p.leverage.value,
      leverageType: p.leverage.type,
    })),
  };
}

export interface SpotBalance {
  coin: string;
  total: number;
  /** Held as margin or in open orders. */
  hold: number;
}

export async function fetchSpotBalances(
  user: string,
  signal?: AbortSignal,
): Promise<SpotBalance[]> {
  const raw = await info<{
    balances: { coin: string; total: string; hold: string }[];
  }>({ type: "spotClearinghouseState", user }, signal);
  return raw.balances
    .map((b) => ({
      coin: b.coin,
      total: Number(b.total),
      hold: Number(b.hold),
    }))
    .filter((b) => b.total !== 0);
}

/** Mid prices by coin name. */
export async function fetchMids(
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const raw = await info<Record<string, string>>({ type: "allMids" }, signal);
  return Object.fromEntries(
    Object.entries(raw).map(([coin, price]) => [coin, Number(price)]),
  );
}

const STABLECOINS = new Set(["USDC", "USDT0", "USDE", "USDH", "USDT"]);

/** USD value of a spot balance, when a price is known. */
export function spotValue(
  balance: SpotBalance,
  mids: Record<string, number> | undefined,
): number | null {
  if (STABLECOINS.has(balance.coin)) return balance.total;
  const price = mids?.[balance.coin];
  return price === undefined ? null : balance.total * price;
}

/** Change over the range: the last PnL point, which starts at 0. */
export function rangePnl(series: PortfolioSeries | undefined): number | null {
  return series?.pnl.at(-1)?.value ?? null;
}

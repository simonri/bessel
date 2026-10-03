import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentValue,
  fetchPerpState,
  fetchPortfolio,
  fetchSpotBalances,
  fetchSubAccounts,
  parseAddress,
  portfolioKey,
  rangePnl,
  shortAddress,
  spotValue,
} from "./hyperliquid";

const ADDRESS = "0xa4178e3b8d7799cd472ceeb63b302b4a1344da19";

function respond(body: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("parseAddress", () => {
  it("reads a bare address, lowercased", () => {
    expect(parseAddress(` ${ADDRESS.toUpperCase().replace("0X", "0x")} `)).toBe(
      ADDRESS,
    );
  });

  it("reads an address out of an explorer link", () => {
    expect(parseAddress(`https://hypurrscan.io/address/${ADDRESS}#more`)).toBe(
      ADDRESS,
    );
    expect(
      parseAddress(`https://app.hyperliquid.xyz/explorer/address/${ADDRESS}`),
    ).toBe(ADDRESS);
  });

  it("rejects anything else", () => {
    expect(parseAddress("hello")).toBeNull();
    expect(parseAddress("0x1234")).toBeNull();
  });

  it("shortens for display", () => {
    expect(shortAddress(ADDRESS)).toBe("0xa417…da19");
  });
});

describe("portfolio", () => {
  it("maps history and picks the series for range and scope", async () => {
    const fetchMock = respond([
      [
        "day",
        {
          accountValueHistory: [
            [1, "100.5"],
            [2, "120.25"],
          ],
          pnlHistory: [
            [1, "0.0"],
            [2, "19.75"],
          ],
          vlm: "7483.93",
        },
      ],
      [
        "perpWeek",
        { accountValueHistory: [[1, "50"]], pnlHistory: [[1, "-3"]], vlm: "0" },
      ],
    ]);
    const portfolio = await fetchPortfolio(ADDRESS);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      type: "portfolio",
      user: ADDRESS,
    });
    expect(portfolio.day.value).toEqual([
      { ts: 1, value: 100.5 },
      { ts: 2, value: 120.25 },
    ]);
    expect(portfolio.day.volume).toBe(7483.93);
    expect(currentValue(portfolio)).toBe(120.25);
    expect(rangePnl(portfolio.day)).toBe(19.75);
    expect(portfolioKey("week", "perp")).toBe("perpWeek");
    expect(portfolioKey("allTime", "perp")).toBe("perpAllTime");
    expect(portfolioKey("month", "total")).toBe("month");
    expect(rangePnl(portfolio[portfolioKey("week", "perp")])).toBe(-3);
  });

  it("has no value before data arrives", () => {
    expect(currentValue(undefined)).toBeNull();
    expect(rangePnl(undefined)).toBeNull();
  });

  it("fails loudly on an API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );
    await expect(fetchPortfolio(ADDRESS)).rejects.toThrow("500");
  });
});

describe("accounts", () => {
  it("lists sub-accounts, and none for an address without any", async () => {
    respond([
      {
        name: "sub1",
        subAccountUser: "0x48A9E95FE4467EBAF48DBA41B2A8C46237B5A58A",
      },
    ]);
    expect(await fetchSubAccounts(ADDRESS)).toEqual([
      { name: "sub1", address: "0x48a9e95fe4467ebaf48dba41b2a8c46237b5a58a" },
    ]);
    respond(null);
    expect(await fetchSubAccounts(ADDRESS)).toEqual([]);
  });

  it("maps perp positions", async () => {
    respond({
      marginSummary: {
        accountValue: "2995369.41",
        totalMarginUsed: "220907.58",
      },
      withdrawable: "2553554.24",
      assetPositions: [
        {
          type: "oneWay",
          position: {
            coin: "BTC",
            szi: "-0.63684",
            leverage: { type: "cross", value: 20 },
            entryPx: "85076.2",
            positionValue: "54088.09",
            unrealizedPnl: "91.88",
            returnOnEquity: "0.0339",
            liquidationPx: null,
          },
        },
      ],
    });
    const perp = await fetchPerpState(ADDRESS);
    expect(perp.withdrawable).toBe(2553554.24);
    expect(perp.positions).toEqual([
      {
        coin: "BTC",
        size: -0.63684,
        entryPrice: 85076.2,
        value: 54088.09,
        unrealizedPnl: 91.88,
        returnOnEquity: 0.0339,
        liquidationPrice: null,
        leverage: 20,
        leverageType: "cross",
      },
    ]);
  });

  it("drops empty spot balances and values the rest", async () => {
    respond({
      balances: [
        { coin: "USDC", total: "36641.4", hold: "15546.5" },
        { coin: "HYPE", total: "2", hold: "0.0" },
        { coin: "USDE", total: "0.0", hold: "0.0" },
        { coin: "OBSCURE", total: "10", hold: "0.0" },
      ],
    });
    const balances = await fetchSpotBalances(ADDRESS);
    expect(balances.map((b) => b.coin)).toEqual(["USDC", "HYPE", "OBSCURE"]);
    const mids = { HYPE: 89.5 };
    expect(balances.map((b) => spotValue(b, mids))).toEqual([
      36641.4,
      179,
      null,
    ]);
  });
});

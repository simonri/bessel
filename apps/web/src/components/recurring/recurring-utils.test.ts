import type { RecurringSeriesSchema, UpcomingPayment } from "@bessel/client";
import { describe, expect, it } from "vitest";
import { apiDate } from "@/lib/local-day";
import {
  billsDueSoon,
  dueLabel,
  dueText,
  orderedTotals,
  recentPriceChange,
  sectionsSummary,
  seriesSections,
} from "./recurring-utils";

const TODAY = "2026-11-03"; // a Tuesday

function series(
  name: string,
  fields: Partial<RecurringSeriesSchema> = {},
): RecurringSeriesSchema {
  return {
    key: `debit|SEK|personal|${name}`,
    review_id: null,
    decision: null,
    name,
    detected_name: name,
    kind: "bill",
    cadence: "monthly",
    currency: "SEK",
    direction: "debit",
    is_business: false,
    bank_account_id: "a",
    logo_url: null,
    typical_amount: 10_000,
    variable: false,
    monthly_amount: 10_000,
    count: 4,
    first_date: apiDate("2026-07-10"),
    last_date: apiDate("2026-10-10"),
    last_amount: 10_000,
    status: "active",
    next_date: apiDate("2026-11-10"),
    next_amount: 10_000,
    price_changes: [],
    ...fields,
  };
}

function payment(
  name: string,
  day: string,
  fields: Partial<UpcomingPayment> = {},
): UpcomingPayment {
  return {
    key: name,
    typical_amount: 100,
    name,
    kind: "bill",
    date: apiDate(day),
    amount: 100,
    currency: "SEK",
    direction: "debit",
    is_business: false,
    bank_account_id: "a",
    late: false,
    ...fields,
  };
}

describe("dueLabel", () => {
  it("says today, tomorrow, a weekday this week, then the date", () => {
    expect(
      [
        "2026-11-03",
        "2026-11-04",
        "2026-11-06",
        "2026-11-09",
        "2026-11-10",
      ].map((d) => dueLabel(apiDate(d), TODAY)),
    ).toEqual(["Today", "Tomorrow", "Friday", "Monday", "10 Nov"]);
  });

  it("reads after other words in lower case only for today and tomorrow", () => {
    expect(dueText(apiDate("2026-11-04"), TODAY)).toBe("due tomorrow");
    expect(dueText(apiDate("2026-11-06"), TODAY)).toBe("due Friday");
  });
});

describe("seriesSections", () => {
  it("sorts running series by kind and due day, apart from ended and dismissed ones", () => {
    const sections = seriesSections([
      series("Rent", { next_date: apiDate("2026-11-27") }),
      series("Power", { next_date: apiDate("2026-11-05") }),
      series("Music", { kind: "subscription" }),
      series("Salary", { kind: "income", direction: "credit" }),
      series("Old gym", { status: "ended", next_date: null }),
      series("Food", { decision: "dismissed" }),
      series("Old app", { decision: "dismissed", status: "ended" }),
    ]);

    expect(sections.bills.map((s) => s.name)).toEqual(["Power", "Rent"]);
    expect(sections.subscriptions.map((s) => s.name)).toEqual(["Music"]);
    expect(sections.income.map((s) => s.name)).toEqual(["Salary"]);
    expect(sections.ended.map((s) => s.name)).toEqual(["Old gym"]);
    expect(sections.dismissed.map((s) => s.name)).toEqual(["Food", "Old app"]);
    expect(sectionsSummary(sections)).toBe(
      "1 subscription, 2 bills and 1 source of income",
    );
  });

  it("has a sentence for nothing", () => {
    expect(sectionsSummary(seriesSections([]))).toBe(
      "Nothing that repeats yet",
    );
  });
});

describe("recentPriceChange", () => {
  const change = (day: string) => ({
    date: apiDate(day),
    old_amount: 9_900,
    new_amount: 12_900,
  });

  it("shows a change within the last few payments", () => {
    const s = series("Music", { price_changes: [change("2026-09-10")] });
    expect(recentPriceChange(s)?.new_amount).toBe(12_900);
  });

  it("forgets a change long ago", () => {
    const s = series("Music", { price_changes: [change("2025-12-10")] });
    expect(recentPriceChange(s)).toBeNull();
  });
});

describe("billsDueSoon", () => {
  it("keeps money out due within the days, and late payments", () => {
    const due = billsDueSoon(
      [
        payment("Late one", "2026-10-28", { late: true }),
        payment("Power", "2026-11-09"),
        payment("Salary", "2026-11-05", { direction: "credit" }),
        payment("Rent", "2026-11-10"),
      ],
      TODAY,
      7,
    );

    expect(due.map((p) => p.name)).toEqual(["Late one", "Power"]);
  });
});

describe("orderedTotals", () => {
  it("puts your own money before the company's", () => {
    const total = (
      currency: string,
      is_business: boolean,
      money_out: number,
    ) => ({
      currency,
      is_business,
      money_out,
      subscriptions: 0,
      money_in: 0,
    });
    expect(
      orderedTotals([
        total("SEK", true, 900),
        total("EUR", false, 10),
        total("SEK", false, 500),
      ]).map((t) => `${t.currency}-${t.is_business}`),
    ).toEqual(["SEK-false", "EUR-false", "SEK-true"]);
  });
});

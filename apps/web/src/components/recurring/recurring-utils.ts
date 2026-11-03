import type {
  PriceChangeSchema,
  RecurringCadence,
  RecurringKind,
  RecurringSeriesSchema,
  RecurringTotal,
  UpcomingPayment,
} from "@bessel/client";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { fromApiDate } from "@/lib/local-day";

export const CADENCE_LABELS: Record<RecurringCadence, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Every quarter",
  yearly: "Yearly",
};

export const KIND_LABELS: Record<RecurringKind, string> = {
  bill: "Bill",
  subscription: "Subscription",
  income: "Income",
};

/** How far off a due day is, from `today` ("yyyy-mm-dd"): "Today", "Tomorrow", a weekday this week, else the date. */
export function dueLabel(day: Date, today: string): string {
  const due = fromApiDate(day);
  const days = differenceInCalendarDays(due, parseISO(today));
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) return format(due, "EEEE");
  return format(due, "d MMM");
}

/** The same, to follow other words: "due today", "due Friday", "due 7 Nov". */
export function dueText(day: Date, today: string): string {
  const label = dueLabel(day, today);
  return `due ${label === "Today" || label === "Tomorrow" ? label.toLowerCase() : label}`;
}

export function daysUntil(day: Date, today: string): number {
  return differenceInCalendarDays(fromApiDate(day), parseISO(today));
}

export interface SeriesSections {
  subscriptions: RecurringSeriesSchema[];
  bills: RecurringSeriesSchema[];
  income: RecurringSeriesSchema[];
  ended: RecurringSeriesSchema[];
  dismissed: RecurringSeriesSchema[];
}

const byNextDue = (a: RecurringSeriesSchema, b: RecurringSeriesSchema) =>
  (a.next_date?.getTime() ?? 0) - (b.next_date?.getTime() ?? 0) ||
  a.name.localeCompare(b.name);

/** Running series by kind, soonest due first; then the ended and the dismissed, latest first. */
export function seriesSections(
  series: readonly RecurringSeriesSchema[],
): SeriesSections {
  const running = series.filter(
    (s) => s.decision !== "dismissed" && s.status !== "ended",
  );
  const ofKind = (kind: RecurringKind) =>
    running.filter((s) => s.kind === kind).sort(byNextDue);
  return {
    subscriptions: ofKind("subscription"),
    bills: ofKind("bill"),
    income: ofKind("income"),
    ended: series.filter(
      (s) => s.decision !== "dismissed" && s.status === "ended",
    ),
    dismissed: series.filter((s) => s.decision === "dismissed"),
  };
}

/** The latest price change, while it's news: within the last three payments' time. */
export function recentPriceChange(
  series: RecurringSeriesSchema,
): PriceChangeSchema | null {
  const latest = series.price_changes.at(-1);
  if (!latest) return null;
  const window = { weekly: 21, monthly: 92, quarterly: 275, yearly: 1100 }[
    series.cadence
  ];
  const age = differenceInCalendarDays(series.last_date, latest.date);
  return age <= window ? latest : null;
}

/** Money out due within `days` of today, and any that's late, soonest first. */
export function billsDueSoon(
  upcoming: readonly UpcomingPayment[],
  today: string,
  days: number,
): UpcomingPayment[] {
  return upcoming.filter(
    (p) =>
      p.direction === "debit" && (p.late || daysUntil(p.date, today) < days),
  );
}

/** The totals for your own money first, then the company's; each currency on its own. */
export function orderedTotals(
  totals: readonly RecurringTotal[],
): RecurringTotal[] {
  return [...totals].sort(
    (a, b) =>
      Number(a.is_business) - Number(b.is_business) ||
      b.money_out - a.money_out,
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "3 subscriptions, 5 bills and 1 income" for what's still running. */
export function sectionsSummary(sections: SeriesSections): string {
  const parts = [
    sections.subscriptions.length &&
      plural(sections.subscriptions.length, "subscription", "subscriptions"),
    sections.bills.length && plural(sections.bills.length, "bill", "bills"),
    sections.income.length &&
      plural(sections.income.length, "source of income", "sources of income"),
  ].filter((part): part is string => !!part);
  if (parts.length === 0) return "Nothing that repeats yet";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

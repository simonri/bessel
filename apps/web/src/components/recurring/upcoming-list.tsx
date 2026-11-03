import type { TransactionDirection, UpcomingPayment } from "@bessel/client";
import { Amount } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import { dueLabel } from "./recurring-utils";

export const BADGE = "shrink-0 rounded-md border px-1.5 type-badge";

export function CompanyBadge() {
  return (
    <span
      className={cn(
        BADGE,
        "border-primary-500/25 bg-primary-500/10 text-primary-300",
      )}
    >
      Company
    </span>
  );
}

export function signedAmount(
  direction: TransactionDirection,
  amount: number,
): number {
  return direction === "credit" ? amount : -amount;
}

/** Payments expected soon, soonest first, with late ones on top. */
export function UpcomingList({
  payments,
  today,
}: {
  payments: UpcomingPayment[];
  today: string;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {payments.map((p) => (
        <li
          key={`${p.key}-${p.typical_amount}-${p.date.toISOString()}`}
          className="flex items-center justify-between gap-3 text-13"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "w-20 shrink-0 text-12",
                p.late ? "text-amber-300" : "text-white/45",
              )}
            >
              {p.late ? "Late" : dueLabel(p.date, today)}
            </span>
            <span className="truncate text-white/85">{p.name}</span>
            {p.is_business && <CompanyBadge />}
          </span>
          <Amount
            value={signedAmount(p.direction, p.amount)}
            currency={p.currency}
            sign
            exact
            className={cn(
              "shrink-0 text-13",
              p.direction === "credit" ? "text-income" : "text-white/80",
            )}
          />
        </li>
      ))}
    </ul>
  );
}

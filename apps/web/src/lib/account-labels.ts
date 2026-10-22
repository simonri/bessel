import type { AccountOverview, AccountProblem } from "@bessel/client";
import { format } from "date-fns";

export type AccountKind =
  | "everyday"
  | "savings"
  | "investments"
  | "credit"
  | "company";

export const ACCOUNT_KINDS: { kind: AccountKind; label: string }[] = [
  { kind: "everyday", label: "Everyday" },
  { kind: "savings", label: "Savings" },
  { kind: "investments", label: "Investments" },
  { kind: "credit", label: "Pay later & cards" },
  { kind: "company", label: "Company" },
];

const INVESTMENT_SUBTYPES = new Set(["isk", "af", "kf", "brokerage"]);

/** Which group an account sits in: the company's accounts together, the rest by what they're for. */
export function accountKind(account: {
  is_business: boolean;
  subtype: string;
}): AccountKind {
  if (account.is_business) return "company";
  if (INVESTMENT_SUBTYPES.has(account.subtype)) return "investments";
  if (account.subtype === "savings") return "savings";
  if (account.subtype === "credit_card" || account.subtype === "loan") {
    return "credit";
  }
  return "everyday";
}

const TYPE_LABELS: Record<string, string> = {
  checking: "Everyday account",
  savings: "Savings account",
  isk: "ISK",
  af: "Shares and funds",
  kf: "Endowment insurance",
  brokerage: "Brokerage",
  credit_card: "Card",
  loan: "Loan",
  other: "Account",
};

export function accountTypeLabel(account: AccountOverview): string {
  if (account.source.kind === "klarna") return "Pay later";
  return TYPE_LABELS[account.subtype] ?? "Account";
}

/** What a fix button does; the page decides how. */
export type FixAction =
  | "renew"
  | "sync"
  | "sign_in"
  | "upload"
  | "import_klarna"
  | "review";

export interface ProblemCopy {
  /** One short line in plain words. */
  title: string;
  action: FixAction;
  actionLabel: string;
}

function day(value: Date | string): string {
  return format(value, "d MMM");
}

/**
 * What's wrong with an account and the one thing that fixes it. A balance
 * mismatch names no amounts here: the page shows them through Amount so they
 * blur with the rest.
 */
export function problemCopy(
  account: AccountOverview,
  problem: AccountProblem,
): ProblemCopy {
  const { source } = account;
  switch (problem.kind) {
    case "sync_failed":
      return {
        title: `Couldn't update from ${source.label}`,
        action: "sync",
        actionLabel: "Try again",
      };
    case "not_shared":
      return {
        title: `Left out when you last approved ${source.label}`,
        action: "renew",
        actionLabel: "Renew access",
      };
    case "stale":
      return {
        title: problem.day
          ? `Not updated since ${day(problem.day)}`
          : "Not updated in a while",
        action: "sync",
        actionLabel: "Update now",
      };
    case "renew_soon":
      return {
        title: problem.day
          ? `Access ends ${day(problem.day)}`
          : "Access ends soon",
        action: "renew",
        actionLabel: "Renew access",
      };
    case "sign_in":
      return {
        title: `${source.label} needs you to sign in again`,
        action: "sign_in",
        actionLabel: "Sign in",
      };
    case "balance_mismatch":
      return source.kind === "klarna"
        ? {
            title: "Doesn't match what Klarna says you owe",
            action: "import_klarna",
            actionLabel: "Import again",
          }
        : {
            title: `Doesn't match ${source.label}'s balance`,
            action: "review",
            actionLabel: "Take a look",
          };
    case "import_due":
      return source.kind === "klarna"
        ? {
            title: problem.day
              ? `Last imported ${day(problem.day)}`
              : "Not imported in a while",
            action: "import_klarna",
            actionLabel: "Import again",
          }
        : {
            title: problem.day
              ? `Nothing new since ${day(problem.day)}`
              : "Nothing new in a while",
            action: "upload",
            actionLabel: "Upload latest file",
          };
    case "no_transactions":
      return {
        title: "No transactions yet",
        action: "upload",
        actionLabel: "Upload a file",
      };
  }
}

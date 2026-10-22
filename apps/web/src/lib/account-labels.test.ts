import type { AccountOverview } from "@bessel/client";
import { describe, expect, it } from "vitest";
import { accountKind, problemCopy } from "./account-labels";

function account(
  source: Partial<AccountOverview["source"]> = {},
): AccountOverview {
  return {
    name: "Buffert",
    subtype: "savings",
    is_business: false,
    source: {
      kind: "manual",
      label: "Imported by hand",
      synced_at: null,
      issue: null,
      problem: null,
      ...source,
    },
  } as AccountOverview;
}

describe("accountKind", () => {
  it("puts the company's accounts together whatever they are", () => {
    expect(accountKind({ is_business: true, subtype: "isk" })).toBe("company");
    expect(accountKind({ is_business: false, subtype: "isk" })).toBe(
      "investments",
    );
    expect(accountKind({ is_business: false, subtype: "savings" })).toBe(
      "savings",
    );
    expect(accountKind({ is_business: false, subtype: "credit_card" })).toBe(
      "credit",
    );
    expect(accountKind({ is_business: false, subtype: "checking" })).toBe(
      "everyday",
    );
  });
});

describe("problemCopy", () => {
  it("asks for the latest file for an account imported by hand", () => {
    const copy = problemCopy(account(), {
      kind: "import_due",
      day: new Date("2026-07-02T00:00:00"),
    });
    expect(copy).toEqual({
      title: "Nothing new since 2 Jul",
      action: "upload",
      actionLabel: "Upload latest file",
    });
  });

  it("asks Klarna to be imported again instead of a file", () => {
    const copy = problemCopy(account({ kind: "klarna", label: "Klarna" }), {
      kind: "import_due",
      day: new Date("2026-07-02T00:00:00"),
    });
    expect([copy.action, copy.title]).toEqual([
      "import_klarna",
      "Last imported 2 Jul",
    ]);
  });

  it("renews the bank's approval when it ends or left the account out", () => {
    const bank = account({ kind: "bank", label: "Skandia" });
    expect(
      problemCopy(bank, { kind: "renew_soon", day: new Date("2026-10-31") })
        .action,
    ).toBe("renew");
    expect(problemCopy(bank, { kind: "not_shared" })).toEqual({
      title: "Left out when you last approved Skandia",
      action: "renew",
      actionLabel: "Renew access",
    });
  });

  it("sends a bank balance mismatch to the account, and Klarna's to an import", () => {
    expect(
      problemCopy(account({ kind: "bank", label: "Skandia" }), {
        kind: "balance_mismatch",
      }).action,
    ).toBe("review");
    expect(
      problemCopy(account({ kind: "klarna", label: "Klarna" }), {
        kind: "balance_mismatch",
      }).action,
    ).toBe("import_klarna");
  });
});

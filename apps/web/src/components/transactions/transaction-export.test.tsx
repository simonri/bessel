// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transactionFilterQuery } from "@/components/transaction-filters";

const api = vi.hoisted(() => ({
  csv: vi.fn(),
  zip: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  exportTransactions: api.csv,
  exportTransactionsWithReceipts: api.zip,
}));

const { TransactionExportMenu, exportFileName } = await import(
  "./transaction-export"
);

const october = { from: "2026-10-01", to: "2026-10-31" };

describe("transactionFilterQuery", () => {
  it("asks for the month at UTC midnight, with the filters as the API names them", () => {
    const query = transactionFilterQuery(
      { bank_account_id: ["a"], is_business: true, transfers: "hide" },
      october,
    );

    expect(query).toMatchObject({
      bank_account_id: ["a"],
      is_business: true,
      transfers: false,
    });
    expect(query.date_from?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(query.date_to?.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(
      transactionFilterQuery({ transfers: "only" }, october).transfers,
    ).toBe(true);
    expect(transactionFilterQuery({}, october).transfers).toBeUndefined();
  });

  it("leaves the month out of a search, which reaches across every month", () => {
    const query = transactionFilterQuery({ search: "kaffe" }, october);

    expect(query.search).toBe("kaffe");
    expect(query.date_from).toBeUndefined();
    expect(query.date_to).toBeUndefined();
  });
});

describe("exportFileName", () => {
  it("names the month, the company's money, or a search", () => {
    expect(exportFileName({}, "2026-10-01")).toBe("transactions-2026-10");
    expect(exportFileName({ is_business: true }, "2026-10-01")).toBe(
      "company-transactions-2026-10",
    );
    expect(exportFileName({ search: "kaffe" }, "2026-10-01")).toBe(
      "transactions-search",
    );
  });
});

describe("TransactionExportMenu", () => {
  const saved: { href: string; download: string }[] = [];

  beforeEach(() => {
    api.csv.mockReset();
    api.zip.mockReset();
    toast.error.mockReset();
    saved.length = 0;
    URL.createObjectURL = vi.fn(() => "blob:export");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ href: this.href, download: this.download });
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const query = transactionFilterQuery({ is_business: true }, october);

  const pick = async (name: RegExp) => {
    render(
      <TransactionExportMenu
        query={query}
        fileName="company-transactions-2026-10"
      />,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: /Export/ }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name }));
  };

  it("downloads the CSV of what's listed through the signed-in client", async () => {
    api.csv.mockResolvedValue({ data: new Blob(["﻿Date"]) });

    await pick(/Spreadsheet/);

    await waitFor(() =>
      expect(saved).toEqual([
        { href: "blob:export", download: "company-transactions-2026-10.csv" },
      ]),
    );
    expect(api.csv).toHaveBeenCalledWith(
      expect.objectContaining({ query, parseAs: "blob" }),
    );
    expect(api.csv.mock.calls[0][0].client).toBeDefined();
    expect(api.zip).not.toHaveBeenCalled();
  });

  it("downloads the zip with receipts when asked for it", async () => {
    api.zip.mockResolvedValue({ data: new Blob(["PK"]) });

    await pick(/With receipts/);

    await waitFor(() =>
      expect(saved).toEqual([
        {
          href: "blob:export",
          download: "company-transactions-2026-10-with-receipts.zip",
        },
      ]),
    );
    expect(api.zip).toHaveBeenCalledWith(
      expect.objectContaining({ query, parseAs: "blob" }),
    );
    expect(api.csv).not.toHaveBeenCalled();
  });

  it("says so when the export fails, and saves nothing", async () => {
    api.csv.mockResolvedValue({ data: undefined, error: { detail: "No" } });

    await pick(/Spreadsheet/);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't export the transactions",
      ),
    );
    expect(saved).toEqual([]);
    expect(screen.getByRole("button", { name: /Export/ })).toHaveProperty(
      "disabled",
      false,
    );
  });
});

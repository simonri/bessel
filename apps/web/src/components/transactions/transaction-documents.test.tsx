// @vitest-environment jsdom
import type { DocumentSchema } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  documents: [] as DocumentSchema[],
  added: [] as { path: unknown; file: File }[],
  removed: [] as unknown[],
  fetched: [] as string[],
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listTransactionDocumentsV1TransactionsTransactionIdDocumentsGetOptions:
    (options: { path: { transaction_id: string } }) => ({
      queryKey: ["documents", options.path.transaction_id],
      queryFn: async () => api.documents,
    }),
  addTransactionDocumentV1TransactionsTransactionIdDocumentsPostMutation:
    () => ({
      mutationFn: async (variables: {
        path: unknown;
        body: { file: File };
      }) => {
        api.added.push({ path: variables.path, file: variables.body.file });
      },
    }),
  removeTransactionDocumentV1TransactionsTransactionIdDocumentsDocumentIdDeleteMutation:
    () => ({
      mutationFn: async (variables: { path: unknown }) => {
        api.removed.push(variables.path);
      },
    }),
  documentThumbnailV1DocumentsDocumentIdThumbnailGet: async (options: {
    path: { document_id: string };
  }) => {
    api.fetched.push(`thumbnail ${options.path.document_id}`);
    return { data: new Blob(["x"]) };
  },
  documentPageV1DocumentsDocumentIdPagesPageGet: async (options: {
    path: { document_id: string; page: number };
  }) => {
    api.fetched.push(`page ${options.path.document_id} ${options.path.page}`);
    return { data: new Blob(["x"]) };
  },
}));
vi.mock("@/lib/client", () => ({ client: { getConfig: () => ({}) } }));

const { TransactionDocuments, keptFiles } = await import(
  "./transaction-documents"
);

function doc(overrides: Partial<DocumentSchema>): DocumentSchema {
  return {
    id: "d1",
    filename: "faktura.pdf",
    content_type: "application/pdf",
    size_bytes: 1000,
    page_count: 1,
    created_at: new Date("2026-10-22"),
    modified_at: null,
    ...overrides,
  } as DocumentSchema;
}

const file = (name: string, type: string) => new File(["x"], name, { type });

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TransactionDocuments transactionId="t1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.documents = [];
  api.added = [];
  api.removed = [];
  api.fetched = [];
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe("keptFiles", () => {
  it("keeps PDFs and photos, including HEIC with no type, and drops the rest", () => {
    const kept = keptFiles([
      file("faktura.pdf", "application/pdf"),
      file("kvitto.jpg", "image/jpeg"),
      file("IMG_0001.HEIC", ""),
      file("notes.txt", "text/plain"),
      file("sheet.xlsx", ""),
    ]);

    expect(kept.map((f) => f.name)).toEqual([
      "faktura.pdf",
      "kvitto.jpg",
      "IMG_0001.HEIC",
    ]);
  });
});

describe("TransactionDocuments", () => {
  it("uploads each chosen file to this transaction", async () => {
    mount();
    expect(await screen.findByText(/Drop a PDF or photo here/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Add invoices or receipts"), {
      target: {
        files: [file("a.pdf", "application/pdf"), file("b.png", "image/png")],
      },
    });

    await waitFor(() => expect(api.added).toHaveLength(2));
    expect(api.added.map((a) => a.file.name)).toEqual(["a.pdf", "b.png"]);
    expect(api.added[0].path).toEqual({ transaction_id: "t1" });
  });

  it("takes only documents from a drop", async () => {
    mount();

    fireEvent.drop(
      screen.getByRole("region", { name: "Invoices and receipts" }),
      {
        dataTransfer: {
          files: [
            file("notes.txt", "text/plain"),
            file("c.pdf", "application/pdf"),
          ],
        },
      },
    );

    await waitFor(() => expect(api.added).toHaveLength(1));
    expect(api.added[0].file.name).toBe("c.pdf");
  });

  it("shows every page in the viewer and removes the document from this transaction", async () => {
    api.documents = [doc({ id: "d1", page_count: 2 })];
    mount();

    fireEvent.click(await screen.findByTitle("faktura.pdf"));
    expect(await screen.findByText("PDF - 2 pages")).toBeTruthy();
    await waitFor(() =>
      expect(api.fetched).toEqual(
        expect.arrayContaining(["thumbnail d1", "page d1 1", "page d1 2"]),
      ),
    );
    expect(api.fetched).not.toContain("page d1 3");

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(
      Array.from(confirm.querySelectorAll("button")).find(
        (b) => b.textContent === "Remove",
      ) as HTMLButtonElement,
    );

    await waitFor(() =>
      expect(api.removed).toEqual([
        { transaction_id: "t1", document_id: "d1" },
      ]),
    );
  });
});

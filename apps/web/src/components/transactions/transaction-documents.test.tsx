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
  documents: [] as unknown[],
  added: [] as { path: unknown; file: File }[],
  removed: [] as unknown[],
  fetched: [] as string[],
  // File names whose upload the API turns down.
  refuse: new Set<string>(),
  // Pages whose preview the API can't find.
  missingPages: new Set<number>(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listTransactionDocumentsOptions: (options: {
    path: { transaction_id: string };
  }) => ({
    queryKey: ["documents", options.path.transaction_id],
    queryFn: async () => api.documents,
  }),
  listTransactionsQueryKey: () => [{ _id: "transactions" }],
  addTransactionDocumentMutation: () => ({
    mutationFn: async (variables: { path: unknown; body: { file: File } }) => {
      if (api.refuse.has(variables.body.file.name)) {
        throw { detail: "Only PDFs and photos can be added." };
      }
      api.added.push({ path: variables.path, file: variables.body.file });
    },
  }),
  removeTransactionDocumentMutation: () => ({
    mutationFn: async (variables: { path: unknown }) => {
      api.removed.push(variables.path);
    },
  }),
  documentThumbnail: async (options: { path: { document_id: string } }) => {
    api.fetched.push(`thumbnail ${options.path.document_id}`);
    return { data: new Blob(["x"]) };
  },
  documentPage: async (options: {
    path: { document_id: string; page: number };
  }) => {
    api.fetched.push(`page ${options.path.document_id} ${options.path.page}`);
    return {
      data: api.missingPages.has(options.path.page)
        ? { detail: "The file is missing." }
        : new Blob(["x"]),
    };
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
    preview_pages: 1,
    created_at: new Date("2026-10-22"),
    modified_at: null,
    ...overrides,
  } as DocumentSchema;
}

const file = (name: string, type: string) => new File(["x"], name, { type });

function mount(transactionId = "t1") {
  const queryClient = new QueryClient();
  const invalidated = vi.spyOn(queryClient, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TransactionDocuments transactionId={transactionId} />
    </QueryClientProvider>,
  );
  return { ...view, invalidated };
}

function paste(files: File[]) {
  const event = new Event("paste", { cancelable: true });
  Object.assign(event, { clipboardData: { files } });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  api.documents = [];
  api.added = [];
  api.removed = [];
  api.fetched = [];
  api.refuse = new Set();
  api.missingPages = new Set();
  toast.success.mockReset();
  toast.error.mockReset();
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
  it("uploads each chosen file to this transaction and refreshes the list's counts", async () => {
    const { invalidated } = mount();
    await screen.findByText(/Drop a PDF or photo here/);

    fireEvent.change(screen.getByLabelText("Add invoices or receipts"), {
      target: {
        files: [file("a.pdf", "application/pdf"), file("b.png", "image/png")],
      },
    });

    await waitFor(() => expect(api.added).toHaveLength(2));
    expect(api.added).toEqual([
      {
        path: { transaction_id: "t1" },
        file: expect.objectContaining({ name: "a.pdf" }),
      },
      {
        path: { transaction_id: "t1" },
        file: expect.objectContaining({ name: "b.png" }),
      },
    ]);
    await waitFor(() =>
      expect(invalidated).toHaveBeenCalledWith({
        queryKey: [{ _id: "transactions" }],
      }),
    );
  });

  it("says which file was turned down and keeps going with the rest", async () => {
    api.refuse.add("notes.pdf");
    mount();

    fireEvent.change(screen.getByLabelText("Add invoices or receipts"), {
      target: {
        files: [
          file("notes.pdf", "application/pdf"),
          file("kvitto.jpg", "image/jpeg"),
        ],
      },
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Only PDFs and photos can be added.",
      ),
    );
    expect(api.added.map((a) => a.file.name)).toEqual(["kvitto.jpg"]);
    await waitFor(() =>
      expect(screen.queryAllByLabelText("Uploading")).toHaveLength(0),
    );
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

  it("takes a pasted screenshot for the open transaction only, and stops listening once closed", async () => {
    const { unmount } = mount("t1");

    const withFile = paste([file("skärmbild.png", "image/png")]);
    const withText = paste([]);

    await waitFor(() => expect(api.added).toHaveLength(1));
    expect(api.added[0].path).toEqual({ transaction_id: "t1" });
    expect([withFile.defaultPrevented, withText.defaultPrevented]).toEqual([
      true,
      false,
    ]);

    unmount();
    paste([file("later.png", "image/png")]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.added).toHaveLength(1);
  });

  it("shows every previewed page in the viewer and removes the document from this transaction", async () => {
    api.documents = [doc({ id: "d1", page_count: 2, preview_pages: 2 })];
    mount();

    fireEvent.click(await screen.findByTitle("faktura.pdf"));
    await screen.findByText("PDF - 2 pages");
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
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says when only the first pages have previews", async () => {
    api.documents = [doc({ page_count: 45, preview_pages: 20 })];
    mount();

    fireEvent.click(await screen.findByTitle("faktura.pdf"));

    await screen.findByText("PDF - 45 pages");
    expect(screen.getByText(/Showing the first 20 of 45 pages/)).toBeInstanceOf(
      HTMLElement,
    );
    await waitFor(() => expect(api.fetched).toContain("page d1 20"));
    expect(api.fetched).not.toContain("page d1 21");
  });

  it("says a page couldn't be shown instead of loading forever", async () => {
    api.documents = [doc({ page_count: 2, preview_pages: 2 })];
    api.missingPages.add(2);
    mount();

    fireEvent.click(await screen.findByTitle("faktura.pdf"));

    await screen.findByText(
      "Page 2 couldn't be shown. Download the file to see it.",
    );
    expect(screen.queryByText(/Page 1 couldn't be shown/)).toBeNull();
    expect(screen.getByAltText("Page 1")).toBeInstanceOf(HTMLImageElement);
  });
});

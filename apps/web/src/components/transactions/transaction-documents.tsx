import type { DocumentSchema } from "@bessel/client";
import {
  addTransactionDocumentV1TransactionsTransactionIdDocumentsPostMutation,
  documentPageV1DocumentsDocumentIdPagesPageGet,
  documentThumbnailV1DocumentsDocumentIdThumbnailGet,
  downloadDocumentV1DocumentsDocumentIdFileGet,
  listTransactionDocumentsV1TransactionsTransactionIdDocumentsGetOptions,
  listTransactionDocumentsV1TransactionsTransactionIdDocumentsGetQueryKey,
  listTransactionsV1TransactionsGetQueryKey,
  removeTransactionDocumentV1TransactionsTransactionIdDocumentsDocumentIdDeleteMutation,
} from "@bessel/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { Spinner } from "@bessel/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Download, FileText, Plus, Trash2 } from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { SoftButton } from "@/components/ui-kit";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import { useAmountsHidden } from "@/lib/privacy";
import { useBlobUrl } from "@/lib/use-blob-url";
import { cn } from "@/lib/utils";

export const DOCUMENT_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

/** Files a person drops or pastes: only the kinds Bessel keeps. */
export function keptFiles(files: Iterable<File>): File[] {
  return [...files].filter(
    (file) =>
      file.type === "application/pdf" ||
      file.type.startsWith("image/") ||
      /\.(pdf|heic|heif)$/i.test(file.name),
  );
}

/** Invoices and receipts kept with one transaction: add, look through, download, remove. */
export function TransactionDocuments({
  transactionId,
}: {
  transactionId: string;
}) {
  const queryClient = useQueryClient();
  const path = { transaction_id: transactionId };
  const queryKey =
    listTransactionDocumentsV1TransactionsTransactionIdDocumentsGetQueryKey({
      client,
      path,
    });
  const { data: documents = [], isLoading } = useQuery(
    listTransactionDocumentsV1TransactionsTransactionIdDocumentsGetOptions({
      client,
      path,
    }),
  );
  const [uploading, setUploading] = useState(0);
  const [open, setOpen] = useState<DocumentSchema | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    // The list's paperclip and "no receipt" filter follow the count.
    void queryClient.invalidateQueries({
      queryKey: listTransactionsV1TransactionsGetQueryKey({ client }),
    });
  };
  const add = useMutation({
    ...addTransactionDocumentV1TransactionsTransactionIdDocumentsPostMutation({
      client,
    }),
    meta: { errorToast: false },
  });
  const remove = useMutation({
    ...removeTransactionDocumentV1TransactionsTransactionIdDocumentsDocumentIdDeleteMutation(
      { client },
    ),
    onSuccess: () => {
      setOpen(null);
      toast.success("Removed");
    },
    onError: (error) => toast.error(errorDetail(error, "Couldn't remove it")),
    onSettled: refresh,
  });

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading((n) => n + files.length);
    await Promise.all(
      files.map((file) =>
        add
          .mutateAsync({ client, path, body: { file } })
          .catch((error: unknown) =>
            toast.error(errorDetail(error, `Couldn't add ${file.name}`)),
          )
          .finally(() => setUploading((n) => n - 1)),
      ),
    );
    refresh();
  };

  // A screenshot or copied file pasted anywhere while the transaction is open lands here.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = keptFiles(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      void upload(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [transactionId]);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void upload(keptFiles(event.dataTransfer.files));
  };

  return (
    <section
      aria-label="Invoices and receipts"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "-mx-2 rounded-xl p-2 transition-colors duration-150",
        dragging && "bg-primary-500/10 ring-1 ring-primary-400/40",
      )}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="type-section text-white/55">Invoices and receipts</h3>
        {documents.length > 0 && (
          <span className="type-caption text-white/40">{documents.length}</span>
        )}
      </div>

      <ul className="grid grid-cols-3 gap-2">
        {documents.map((document) => (
          <li key={document.id}>
            <Thumbnail document={document} onOpen={() => setOpen(document)} />
          </li>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have nothing else to tell them apart.
          <li key={`uploading-${i}`}>
            <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03]">
              <Spinner className="size-4 text-white/50" />
            </div>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 text-white/50 transition-colors duration-150 hover:border-white/30 hover:text-white/80"
          >
            <Plus className="size-4" aria-hidden />
            <span className="type-caption">Add</span>
          </button>
        </li>
      </ul>
      {!isLoading && documents.length === 0 && uploading === 0 && (
        <p className="mt-2 type-caption text-white/40">
          Drop a PDF or photo here, paste one, or add it from your files.
        </p>
      )}
      <SoftButton
        className="mt-2 hidden pointer-coarse:inline-flex"
        onClick={() => cameraInput.current?.click()}
      >
        <Camera aria-hidden />
        Take photo
      </SoftButton>

      <input
        ref={fileInput}
        type="file"
        accept={DOCUMENT_ACCEPT}
        multiple
        hidden
        aria-label="Add invoices or receipts"
        onChange={(event) => {
          void upload([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label="Take a photo of a receipt"
        onChange={(event) => {
          void upload([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />

      <DocumentViewer
        document={open}
        onClose={() => setOpen(null)}
        onRemove={(document) =>
          remove.mutate({
            client,
            path: { transaction_id: transactionId, document_id: document.id },
          })
        }
        removing={remove.isPending}
      />
    </section>
  );
}

function Thumbnail({
  document,
  onOpen,
}: {
  document: DocumentSchema;
  onOpen: () => void;
}) {
  const hidden = useAmountsHidden();
  const url = useBlobUrl(document.id, () =>
    documentThumbnailV1DocumentsDocumentIdThumbnailGet({
      client,
      path: { document_id: document.id },
      parseAs: "blob",
    }).then((r) => r.data),
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      title={document.filename}
      className="group relative block aspect-[3/4] w-full overflow-hidden rounded-lg border border-white/[0.07] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60"
    >
      {url ? (
        <img
          src={url}
          alt={document.filename}
          className={cn(
            "size-full object-cover object-top",
            hidden && "blur-md",
          )}
        />
      ) : (
        <FileText
          className="absolute inset-0 m-auto size-5 text-black/30"
          aria-hidden
        />
      )}
      {document.content_type === "application/pdf" && (
        <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 type-badge text-white/85">
          PDF
        </span>
      )}
    </button>
  );
}

function DocumentViewer({
  document,
  onClose,
  onRemove,
  removing,
}: {
  document: DocumentSchema | null;
  onClose: () => void;
  onRemove: (document: DocumentSchema) => void;
  removing: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const download = async () => {
    if (!document) return;
    const { data } = await downloadDocumentV1DocumentsDocumentIdFileGet({
      client,
      path: { document_id: document.id },
      parseAs: "blob",
    });
    if (!(data instanceof Blob)) {
      toast.error("Couldn't download it");
      return;
    }
    const url = URL.createObjectURL(data);
    const link = Object.assign(window.document.createElement("a"), {
      href: url,
      download: document.filename,
    });
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog open={!!document} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        {document && (
          <>
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3 pr-12">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate type-heading text-white/90">
                  {document.filename}
                </DialogTitle>
                <DialogDescription className="type-caption text-white/45">
                  {document.content_type === "application/pdf"
                    ? `PDF - ${document.page_count} page${document.page_count === 1 ? "" : "s"}`
                    : "Photo"}
                </DialogDescription>
              </div>
              <SoftButton onClick={() => void download()}>
                <Download aria-hidden />
                Download
              </SoftButton>
              <SoftButton
                onClick={() => setConfirming(true)}
                className="bg-red-500/10 text-red-300 hover:bg-red-500/15 hover:text-red-200"
              >
                <Trash2 aria-hidden />
                Remove
              </SoftButton>
            </div>
            <div className="space-y-3 overflow-y-auto bg-black/30 p-4">
              {Array.from({ length: document.page_count }, (_, i) => i + 1).map(
                (page) => (
                  <Page key={page} documentId={document.id} page={page} />
                ),
              )}
            </div>
            <ConfirmDeleteDialog
              size="sm"
              open={confirming}
              onOpenChange={setConfirming}
              title="Remove it from this transaction?"
              description="If no other transaction has it, the file is deleted."
              confirmLabel="Remove"
              pendingLabel="Removing…"
              isPending={removing}
              onConfirm={() => {
                setConfirming(false);
                onRemove(document);
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Page({ documentId, page }: { documentId: string; page: number }) {
  const hidden = useAmountsHidden();
  const url = useBlobUrl(`${documentId}-${page}`, () =>
    documentPageV1DocumentsDocumentIdPagesPageGet({
      client,
      path: { document_id: documentId, page },
      parseAs: "blob",
    }).then((r) => r.data),
  );
  if (!url) {
    return (
      <div className="flex aspect-[3/4] items-center justify-center rounded-md bg-white/[0.04]">
        <Spinner className="size-5 text-white/40" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`Page ${page}`}
      className={cn(
        "w-full rounded-md bg-white shadow-lg",
        hidden && "blur-lg",
      )}
    />
  );
}

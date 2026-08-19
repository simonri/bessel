import type { TaskAttachmentSchema } from "@bessel/client";
import { getTaskAttachmentFileV1TasksTaskIdAttachmentsAttachmentIdFileGet } from "@bessel/client";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { client } from "@/lib/client";

// A pasted image that hasn't been uploaded yet — only exists for a task
// that isn't saved yet, so there's no task_id to upload to until creation
// succeeds.
export interface PendingAttachment {
  file: File;
  previewUrl: string;
}

export function extractPastedImages(e: React.ClipboardEvent): File[] {
  return Array.from(e.clipboardData?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file != null);
}

function AttachmentFrame({
  title,
  filename,
  onOpen,
  onRemove,
  removing,
  children,
}: {
  title: string;
  filename: string;
  onOpen?: () => void;
  onRemove: () => void;
  removing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-1 pr-2 text-xs">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        title={title}
        className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded bg-muted"
      >
        {children}
      </button>
      <span className="max-w-32 truncate">{filename}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        title="Remove"
        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

// Auth on this app is a Bearer token attached by a fetch interceptor, so a
// plain <img src="/v1/..."> can't authenticate — the file is fetched through
// the same authenticated client and rendered from a local blob URL instead.
export function AttachmentBadge({
  attachment,
  onDelete,
  deleting,
}: {
  attachment: TaskAttachmentSchema;
  onDelete: () => void;
  deleting?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    getTaskAttachmentFileV1TasksTaskIdAttachmentsAttachmentIdFileGet({
      client,
      path: { task_id: attachment.task_id, attachment_id: attachment.id },
      parseAs: "blob",
    }).then(({ data }) => {
      if (cancelled || !data) return;
      objectUrl = URL.createObjectURL(data as Blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.task_id]);

  return (
    <AttachmentFrame
      title={attachment.filename}
      filename={attachment.filename}
      onOpen={
        url
          ? () => window.open(url, "_blank", "noopener,noreferrer")
          : undefined
      }
      onRemove={onDelete}
      removing={deleting}
    >
      {url && <img src={url} alt="" className="size-full object-cover" />}
    </AttachmentFrame>
  );
}

// Same badge shape as AttachmentBadge, but for an image pasted into a task
// that hasn't been created yet — previewed from its local blob URL, nothing
// to fetch.
export function PendingAttachmentBadge({
  pending,
  onRemove,
}: {
  pending: PendingAttachment;
  onRemove: () => void;
}) {
  return (
    <AttachmentFrame
      title={pending.file.name}
      filename={pending.file.name}
      onOpen={() =>
        window.open(pending.previewUrl, "_blank", "noopener,noreferrer")
      }
      onRemove={onRemove}
    >
      <img src={pending.previewUrl} alt="" className="size-full object-cover" />
    </AttachmentFrame>
  );
}

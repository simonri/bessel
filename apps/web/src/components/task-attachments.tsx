import type { TaskAttachmentSchema } from "@bessel/client";
import {
  getTaskAttachmentFileV1TasksTaskIdAttachmentsAttachmentIdFileGet,
  uploadTaskAttachmentV1TasksTaskIdAttachmentsPostMutation,
} from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useTaskCacheHelpers } from "@/hooks/use-task-cache";
import { client } from "@/lib/client";
import { linkify, shortLink } from "@/lib/linkify";

// A pasted image that hasn't been uploaded yet — only exists for a task
// that isn't saved yet, so there's no task_id to upload to until creation
// succeeds. `tempId` is the id embedded in the description marker
// (`pending:<uuid>`) until the real upload resolves and swaps it out.
export interface PendingAttachment {
  file: File;
  previewUrl: string;
  tempId: string;
}

export function extractPastedImages(e: React.ClipboardEvent): File[] {
  return Array.from(e.clipboardData?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file != null);
}

// Pasted images are represented inline in the plain-text description as
// `![filename](attachment:<id>)` — a markdown-image-shaped marker, chosen
// because it reads sensibly as literal text in the edit textarea (which,
// being a native <textarea>, can't render a real inline image) while giving
// the read-only view an unambiguous id to resolve to an actual thumbnail
// at the exact spot it was pasted.
const MARKER_RE = /!\[([^\]]*)\]\(attachment:([^)]+)\)/g;

export function attachmentMarker(id: string, filename: string): string {
  return `![${filename}](attachment:${id})`;
}

export function replaceMarkerId(
  text: string,
  oldId: string,
  newId: string,
): string {
  return text.split(`(attachment:${oldId})`).join(`(attachment:${newId})`);
}

export function removeMarker(
  text: string,
  id: string,
  filename: string,
): string {
  return text.replace(attachmentMarker(id, filename), "");
}

export type DescriptionSegment =
  | { type: "text"; text: string }
  | { type: "attachment"; filename: string; attachmentId: string };

export function parseDescriptionSegments(
  description: string,
): DescriptionSegment[] {
  const segments: DescriptionSegment[] = [];
  let lastIndex = 0;
  for (const match of description.matchAll(MARKER_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex)
      segments.push({
        type: "text",
        text: description.slice(lastIndex, index),
      });
    segments.push({
      type: "attachment",
      filename: match[1],
      attachmentId: match[2],
    });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < description.length)
    segments.push({ type: "text", text: description.slice(lastIndex) });
  return segments;
}

/**
 * Pasting images into a saved task's description: each shows at once as a `pending:` marker at the cursor and is
 * swapped for the real one when its upload is done. `settled` resolves once every upload has, so a save never
 * stores a pending marker.
 */
export function useImagePaste({
  taskId,
  textareaRef,
  getText,
  setText,
}: {
  taskId: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  getText: () => string;
  setText: (update: (text: string) => string) => void;
}) {
  const cache = useTaskCacheHelpers();
  const upload = useMutation({
    ...uploadTaskAttachmentV1TasksTaskIdAttachmentsPostMutation({ client }),
    meta: { errorToast: false },
  });
  const inFlight = useRef(new Set<Promise<void>>());
  const [uploading, setUploading] = useState(0);

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = extractPastedImages(e);
    if (files.length === 0) return;
    e.preventDefault();
    let position = textareaRef.current?.selectionStart ?? getText().length;
    for (const file of files) {
      const tempId = `pending:${crypto.randomUUID()}`;
      const marker = attachmentMarker(tempId, file.name);
      const at = position;
      setText((text) => text.slice(0, at) + marker + text.slice(at));
      position += marker.length;
      setUploading((n) => n + 1);
      const done: Promise<void> = upload
        .mutateAsync({ client, path: { task_id: taskId }, body: { file } })
        .then(
          (attachment) => {
            setText((text) => replaceMarkerId(text, tempId, attachment.id));
            cache.invalidateAll();
          },
          () => {
            toast.error(`Couldn't attach ${file.name}`);
            setText((text) => removeMarker(text, tempId, file.name));
          },
        )
        .finally(() => {
          inFlight.current.delete(done);
          setUploading((n) => n - 1);
        });
      inFlight.current.add(done);
    }
    const cursor = position;
    requestAnimationFrame(() =>
      textareaRef.current?.setSelectionRange(cursor, cursor),
    );
  };

  return {
    onPaste,
    uploading: uploading > 0,
    settled: () => Promise.all([...inFlight.current]).then(() => undefined),
  };
}

// Auth on this app is a Bearer token attached by a fetch interceptor, so a
// plain <img src="/v1/..."> can't authenticate — the file is fetched through
// the same authenticated client and rendered from a local blob URL instead.
function useAttachmentImageUrl(
  attachment: TaskAttachmentSchema,
): string | null {
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

  return url;
}

// Renders inline with surrounding text (at the exact spot its marker sits in
// the description) as a small thumbnail chip. Hovering the thumbnail pops a
// full-size preview — plain onMouseEnter/Leave state, no timer anywhere in
// the path, so it opens and closes on the same event tick as the hover
// itself. Portaled to <body> and positioned with `fixed` from a measured
// rect rather than nested `absolute` — the badge sits inside a scrolling
// dialog body (`overflow-y-auto`), which would otherwise clip a popup that
// tries to float above it.
export function InlineAttachmentBadge({
  attachment,
  onDelete,
  deleting,
}: {
  attachment: TaskAttachmentSchema;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const url = useAttachmentImageUrl(attachment);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const [previewPos, setPreviewPos] = useState<{
    left: number;
    bottom: number;
  } | null>(null);

  return (
    <span className="mx-0.5 inline-flex max-w-full items-center gap-1 align-middle rounded-md border border-white/10 bg-muted/40 py-0.5 pl-0.5 pr-1.5 text-12">
      <span
        ref={thumbRef}
        className="relative inline-block size-5 shrink-0 overflow-hidden rounded bg-muted"
        onMouseEnter={() => {
          const rect = thumbRef.current?.getBoundingClientRect();
          if (rect)
            setPreviewPos({
              left: rect.left + rect.width / 2,
              bottom: window.innerHeight - rect.top + 6,
            });
        }}
        onMouseLeave={() => setPreviewPos(null)}
      >
        {url && <img src={url} alt="" className="size-full object-cover" />}
      </span>
      {url &&
        previewPos &&
        createPortal(
          <span
            className="pointer-events-none fixed z-50 -translate-x-1/2 rounded-lg border border-white/15 bg-black/90 p-1 shadow-2xl"
            style={{ left: previewPos.left, bottom: previewPos.bottom }}
          >
            <img
              src={url}
              alt={attachment.filename}
              className="max-h-72 max-w-72 rounded object-contain"
            />
          </span>,
          document.body,
        )}
      <span className="max-w-32 truncate">{attachment.filename}</span>
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          onClick={onDelete}
          disabled={deleting}
          title="Remove"
          className="size-auto p-0 text-muted-foreground hover:bg-transparent hover:text-destructive"
        >
          <X className="size-3" />
        </Button>
      )}
    </span>
  );
}

/** Text with its web and email addresses as links, which open in a new tab (the desktop app hands them to the browser). */
export function LinkifiedText({ text }: { text: string }) {
  return (
    <span>
      {linkify(text).map((part, i) =>
        part.type === "text" ? (
          part.text
        ) : (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are a fixed split of `text`
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            title={part.href}
            onClick={(e) => e.stopPropagation()}
            className="text-sky-300 underline decoration-sky-300/40 underline-offset-2 transition-colors hover:text-sky-200 hover:decoration-sky-200"
          >
            {shortLink(part.href)}
          </a>
        ),
      )}
    </span>
  );
}

// Renders a description's text with every `![name](attachment:id)` marker
// replaced by an inline thumbnail badge in place — the image shows up right
// where it was pasted, not collected in a separate list. Any attachment the
// task has that ISN'T referenced by a marker (uploaded before this scheme
// existed, or its marker got edited out) still renders, appended at the end,
// so nothing silently disappears.
export function DescriptionWithAttachments({
  description,
  attachments,
  onDeleteAttachment,
  deletingAttachmentId,
}: {
  description: string;
  attachments: TaskAttachmentSchema[];
  onDeleteAttachment?: (attachmentId: string) => void;
  deletingAttachmentId?: string | null;
}) {
  const byId = new Map(attachments.map((a) => [a.id, a]));
  const segments = parseDescriptionSegments(description);
  const referencedIds = new Set(
    segments.filter((s) => s.type === "attachment").map((s) => s.attachmentId),
  );
  const orphaned = attachments.filter((a) => !referencedIds.has(a.id));

  let offset = 0;
  return (
    <p className="text-13 leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
      {segments.map((seg) => {
        // Keyed by position in the source text rather than array index —
        // segments are a deterministic, order-preserving split of
        // `description`, so this is stable across re-renders of the same text.
        const key = offset;
        offset +=
          seg.type === "text"
            ? seg.text.length
            : seg.filename.length + seg.attachmentId.length + 15;
        if (seg.type === "text")
          return <LinkifiedText key={key} text={seg.text} />;
        const attachment = byId.get(seg.attachmentId);
        if (!attachment) return null;
        return (
          <InlineAttachmentBadge
            key={attachment.id}
            attachment={attachment}
            onDelete={
              onDeleteAttachment
                ? () => onDeleteAttachment(attachment.id)
                : undefined
            }
            deleting={deletingAttachmentId === attachment.id}
          />
        );
      })}
      {orphaned.map((attachment) => (
        <InlineAttachmentBadge
          key={attachment.id}
          attachment={attachment}
          onDelete={
            onDeleteAttachment
              ? () => onDeleteAttachment(attachment.id)
              : undefined
          }
          deleting={deletingAttachmentId === attachment.id}
        />
      ))}
    </p>
  );
}

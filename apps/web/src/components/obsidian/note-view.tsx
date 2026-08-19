import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@bessel/ui/components/empty";
import { Skeleton } from "@bessel/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@bessel/ui/components/toggle-group";
import { format } from "date-fns";
import { TriangleAlert } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useNote, useReadNote, useVaultMutations } from "./hooks/use-vault";
import type { NoteMode } from "./lib/vault-state";
import { basenameOf, isImageRel, vaultAssetUrl } from "./lib/wikilinks";
import { NoteEditor, type NoteEditorHandle } from "./note-editor";
import { NoteReader } from "./note-reader";
import { VAULT_CONFLICT_ERROR, type VaultIndex } from "./vault-types";

export interface NoteViewHandle {
  /** 0-based line. */
  scrollToLine: (line: number) => void;
  focus: () => void;
  /** Writes any pending edits now (tab switch, vault switch, page unmount). */
  flush: () => Promise<void>;
}

export interface NoteViewProps {
  root: string;
  /** Rel of the open note. */
  rel: string;
  mode: NoteMode;
  files: readonly string[];
  index: VaultIndex | undefined;
  /** Obsidian `attachmentFolderPath` ("" = vault root) for pasted images. */
  attachmentFolder: string;
  /** A `[[target]]` (raw, unresolved) or `#tag` was activated. */
  onOpenLink: (target: string, opts: { newTab: boolean }) => void;
  /** The user edited the title (basename without ".md"). */
  onRename: (newBasename: string) => void;
  onModeChange: (mode: NoteMode) => void;
}

const SAVE_DEBOUNCE_MS = 400;
const WORD_COUNT_DEBOUNCE_MS = 300;
const TASK_LINE_RE = /^(\s*(?:[-*+]|\d+[.)])\s\[)([ xX])(\].*)$/;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const NoteView = forwardRef<NoteViewHandle, NoteViewProps>(
  function NoteView(
    {
      root,
      rel,
      mode,
      files,
      index,
      attachmentFolder,
      onOpenLink,
      onRename,
      onModeChange,
    },
    ref,
  ) {
    const noteQuery = useNote(root, rel);
    const { saveNote, writeBinary } = useVaultMutations(root);
    const readNote = useReadNote(root);

    // Mutable mirrors of the buffer/save state, read from callbacks (debounce
    // timers, effect cleanups, imperative handles) that must never see stale
    // closures. `buffer`/`dirty`/`saving` are the render-facing copies.
    const bufferRef = useRef("");
    const relRef = useRef<string | null>(null);
    const lastSavedRef = useRef("");
    const loadedMtimeRef = useRef<number | null>(null);
    const dirtyRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const runningSaveRef = useRef<Promise<void> | null>(null);
    const queuedRef = useRef(false);

    const [buffer, setBuffer] = useState("");
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [conflict, setConflict] = useState(false);

    const adopt = useCallback(
      (newRel: string, content: string, mtimeMs: number) => {
        relRef.current = newRel;
        bufferRef.current = content;
        lastSavedRef.current = content;
        loadedMtimeRef.current = mtimeMs;
        dirtyRef.current = false;
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        setBuffer(content);
        setDirty(false);
        setConflict(false);
      },
      [],
    );

    // Adopts the loaded/refetched note into the buffer: unconditionally when
    // switching to a different note, silently when the underlying data changed
    // (watcher-driven refetch) and the buffer is clean, or as a conflict when
    // it's dirty and the disk mtime moved from under it.
    useEffect(() => {
      const data = noteQuery.data;
      if (data === undefined) return;
      if (relRef.current !== rel) {
        adopt(rel, data.content, data.mtimeMs);
        return;
      }
      if (
        data.content === lastSavedRef.current &&
        data.mtimeMs === loadedMtimeRef.current
      )
        return;
      if (!dirtyRef.current) {
        adopt(rel, data.content, data.mtimeMs);
      } else if (data.mtimeMs !== loadedMtimeRef.current) {
        setConflict(true);
      }
    }, [rel, noteQuery.data, adopt]);

    const doSave = useCallback(async () => {
      const content = bufferRef.current;
      const saveRel = relRef.current;
      if (saveRel === null || content === lastSavedRef.current) return;
      setSaving(true);
      try {
        const result = await saveNote.mutateAsync({
          rel: saveRel,
          content,
          expectedMtimeMs: loadedMtimeRef.current,
        });
        lastSavedRef.current = content;
        loadedMtimeRef.current = result.mtimeMs;
        setConflict(false);
        if (bufferRef.current === content && relRef.current === saveRel) {
          dirtyRef.current = false;
          setDirty(false);
        }
      } catch (err) {
        const message = errorMessage(err);
        if (message.includes(VAULT_CONFLICT_ERROR)) {
          setConflict(true);
        } else {
          toast.error(message);
        }
      } finally {
        setSaving(false);
      }
    }, [saveNote]);

    // Serializes saves: a save already in flight is awaited by callers instead
    // of started twice, and one more change that arrives mid-save is folded
    // into a single follow-up save rather than firing per keystroke.
    const runSave = useCallback((): Promise<void> => {
      if (runningSaveRef.current) {
        queuedRef.current = true;
        return runningSaveRef.current;
      }
      const promise = (async () => {
        await doSave();
        while (queuedRef.current) {
          queuedRef.current = false;
          await doSave();
        }
      })().finally(() => {
        runningSaveRef.current = null;
      });
      runningSaveRef.current = promise;
      return promise;
    }, [doSave]);

    const flush = useCallback(async () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (bufferRef.current === lastSavedRef.current && !runningSaveRef.current)
        return;
      await runSave();
    }, [runSave]);

    // Cleanup runs (via this ref indirection, so the effect below stays keyed
    // only on `rel`) before the adopt effect's setup for the new rel — so the
    // outgoing note's edits are captured and sent before its buffer is
    // replaced by the incoming note's content.
    const flushRef = useRef(flush);
    useEffect(() => {
      flushRef.current = flush;
    }, [flush]);
    useEffect(() => {
      return () => {
        void flushRef.current();
      };
    }, [rel]);

    useEffect(() => {
      function onBlur() {
        void flushRef.current();
      }
      window.addEventListener("blur", onBlur);
      return () => window.removeEventListener("blur", onBlur);
    }, []);

    const handleChange = useCallback(
      (value: string) => {
        bufferRef.current = value;
        setBuffer(value);
        const isDirty = value !== lastSavedRef.current;
        dirtyRef.current = isDirty;
        setDirty(isDirty);
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        if (!isDirty) return;
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          void runSave();
        }, SAVE_DEBOUNCE_MS);
      },
      [runSave],
    );

    const handleReload = useCallback(async () => {
      const result = await noteQuery.refetch();
      if (result.data) adopt(rel, result.data.content, result.data.mtimeMs);
      else setConflict(false);
    }, [noteQuery, rel, adopt]);

    const handleKeepMine = useCallback(async () => {
      setConflict(false);
      const content = bufferRef.current;
      const saveRel = relRef.current;
      if (saveRel === null) return;
      try {
        const result = await saveNote.mutateAsync({
          rel: saveRel,
          content,
          expectedMtimeMs: null,
        });
        lastSavedRef.current = content;
        loadedMtimeRef.current = result.mtimeMs;
        if (bufferRef.current === content) {
          dirtyRef.current = false;
          setDirty(false);
        }
      } catch (err) {
        toast.error(errorMessage(err));
      }
    }, [saveNote]);

    const handleToggleTask = useCallback(
      (line: number, checked: boolean) => {
        const lines = bufferRef.current.split("\n");
        const target = lines[line];
        if (target === undefined) return;
        const match = target.match(TASK_LINE_RE);
        if (!match) return;
        lines[line] = `${match[1]}${checked ? "x" : " "}${match[3]}`;
        handleChange(lines.join("\n"));
      },
      [handleChange],
    );

    // ── Title editing ──────────────────────────────────────────────────────
    const [titleDraft, setTitleDraft] = useState(() => basenameOf(rel));
    useEffect(() => {
      setTitleDraft(basenameOf(rel));
    }, [rel]);

    const commitTitle = useCallback(() => {
      const trimmed = titleDraft.trim();
      const current = basenameOf(rel);
      if (
        !trimmed ||
        trimmed.includes("/") ||
        trimmed.includes("\\") ||
        trimmed === current
      ) {
        setTitleDraft(current);
        return;
      }
      onRename(trimmed);
    }, [titleDraft, rel, onRename]);

    // ── Mode / Ctrl+E ──────────────────────────────────────────────────────
    const lastEditModeRef = useRef<"source" | "live">(
      mode === "reading" ? "live" : mode,
    );
    useEffect(() => {
      if (mode !== "reading") lastEditModeRef.current = mode;
    }, [mode]);

    const toggleReadingMode = useCallback(() => {
      onModeChange(mode === "reading" ? lastEditModeRef.current : "reading");
    }, [mode, onModeChange]);

    const toggleReadingModeRef = useRef(toggleReadingMode);
    useEffect(() => {
      toggleReadingModeRef.current = toggleReadingMode;
    }, [toggleReadingMode]);

    useEffect(() => {
      function onWindowKeyDown(e: KeyboardEvent) {
        if (e.defaultPrevented || e.repeat) return;
        if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
        if (e.key.toLowerCase() !== "e") return;
        e.preventDefault();
        toggleReadingModeRef.current();
      }
      window.addEventListener("keydown", onWindowKeyDown);
      return () => window.removeEventListener("keydown", onWindowKeyDown);
    }, []);

    const handleRootKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.repeat) return;
        if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
        if (e.key.toLowerCase() !== "e") return;
        e.preventDefault();
        toggleReadingMode();
      },
      [toggleReadingMode],
    );

    // ── Word count (debounced off the buffer, not the render) ────────────
    const [wordCountSource, setWordCountSource] = useState("");
    useEffect(() => {
      const timer = setTimeout(
        () => setWordCountSource(buffer),
        WORD_COUNT_DEBOUNCE_MS,
      );
      return () => clearTimeout(timer);
    }, [buffer]);
    const wordCount = useMemo(() => {
      const trimmed = wordCountSource.trim();
      return trimmed ? trimmed.split(/\s+/).length : 0;
    }, [wordCountSource]);

    // ── Editor/reader plumbing ─────────────────────────────────────────────
    const headingsFor = useCallback(
      (noteRel: string) =>
        index?.files[noteRel]?.headings.map((h) => h.text) ?? [],
      [index],
    );

    const resolveAsset = useCallback(
      (assetRel: string): string | null => {
        if (!isImageRel(assetRel)) return null;
        const resolved = assetRel.includes("/")
          ? assetRel
          : attachmentFolder
            ? `${attachmentFolder}/${assetRel}`
            : assetRel;
        return vaultAssetUrl(root, resolved);
      },
      [root, attachmentFolder],
    );

    const onPasteImage = useCallback(
      async (file: File): Promise<string | null> => {
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const name = `Pasted image ${format(new Date(), "yyyyMMddHHmmss")}.${ext}`;
        const targetRel = attachmentFolder
          ? `${attachmentFolder}/${name}`
          : name;
        try {
          const data = new Uint8Array(await file.arrayBuffer());
          const res = await writeBinary.mutateAsync({ rel: targetRel, data });
          return res.rel;
        } catch (err) {
          toast.error(errorMessage(err) || "Failed to paste image");
          return null;
        }
      },
      [attachmentFolder, writeBinary],
    );

    const editorRef = useRef<NoteEditorHandle>(null);
    const readingContainerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        scrollToLine: (line: number) => {
          if (mode === "reading") {
            const container = readingContainerRef.current;
            if (!container) return;
            const headings = index?.files[rel]?.headings ?? [];
            let target: { text: string } | undefined;
            for (const h of headings) {
              if (h.line <= line) target = h;
              else break;
            }
            if (target) {
              const heading = Array.from(
                container.querySelectorAll("h1, h2, h3, h4, h5, h6"),
              ).find((el) => el.textContent?.trim() === target?.text);
              if (heading) {
                heading.scrollIntoView({ block: "start", behavior: "smooth" });
                return;
              }
            }
            const totalLines = Math.max(
              bufferRef.current.split("\n").length,
              1,
            );
            const ratio = Math.min(Math.max(line / totalLines, 0), 1);
            container.scrollTop =
              ratio * (container.scrollHeight - container.clientHeight);
          } else {
            editorRef.current?.scrollToLine(line);
          }
        },
        focus: () => {
          if (mode !== "reading") editorRef.current?.focus();
        },
        flush,
      }),
      [mode, index, rel, flush],
    );

    if (noteQuery.isLoading) {
      return (
        <div className="flex h-full min-h-0 flex-col gap-3 p-5">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      );
    }

    if (noteQuery.isError || !noteQuery.data) {
      return (
        <Empty className="h-full">
          <EmptyHeader>
            <EmptyTitle>Note unavailable</EmptyTitle>
            <EmptyDescription>
              {noteQuery.error
                ? errorMessage(noteQuery.error)
                : "This note couldn't be loaded"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    const statusLabel = saving ? "Saving…" : dirty ? "Unsaved" : "Saved";

    return (
      <div
        className="flex h-full min-h-0 flex-col"
        onKeyDown={handleRootKeyDown}
      >
        <div className="flex shrink-0 items-center gap-3 px-5 pt-4">
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setTitleDraft(basenameOf(rel));
                e.currentTarget.blur();
              }
            }}
            className="min-w-0 flex-1 truncate border-none bg-transparent text-lg font-semibold text-white/90 outline-none"
          />
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(value) => value && onModeChange(value as NoteMode)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="source">Source</ToggleGroupItem>
            <ToggleGroupItem value="live">Live</ToggleGroupItem>
            <ToggleGroupItem value="reading">Reading</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 px-5 pt-1 pb-2 text-11 text-white/40">
          <span>{statusLabel}</span>
          <span>·</span>
          <span>
            {wordCount} word{wordCount === 1 ? "" : "s"}
          </span>
        </div>

        {conflict && (
          <div className="mx-5 mb-3 flex shrink-0 items-center gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200/90">
            <TriangleAlert className="size-3.5 shrink-0" />
            <span className="flex-1">This note changed on disk</span>
            <button
              type="button"
              onClick={() => void handleReload()}
              className="shrink-0 rounded border border-amber-400/30 px-2 py-1 text-11 transition-colors hover:bg-amber-400/15"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => void handleKeepMine()}
              className="shrink-0 rounded border border-amber-400/30 px-2 py-1 text-11 transition-colors hover:bg-amber-400/15"
            >
              Keep mine
            </button>
          </div>
        )}

        <div ref={readingContainerRef} className="min-h-0 flex-1 overflow-auto">
          {mode === "reading" ? (
            <NoteReader
              content={buffer}
              fromRel={rel}
              files={files}
              root={root}
              onOpenLink={onOpenLink}
              onToggleTask={handleToggleTask}
              readNote={readNote}
            />
          ) : (
            <NoteEditor
              ref={editorRef}
              value={buffer}
              onChange={handleChange}
              mode={mode}
              files={files}
              headingsFor={headingsFor}
              fromRel={rel}
              resolveAsset={resolveAsset}
              onOpenLink={onOpenLink}
              onPasteImage={onPasteImage}
              onSave={() => void flush()}
              className="h-full"
            />
          )}
        </div>
      </div>
    );
  },
);

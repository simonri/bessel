import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@bessel/ui/components/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { cn } from "@bessel/ui/lib/utils";
import { FilePlus } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useVaultSearch } from "./hooks/use-vault";
import { fuzzyScore } from "./lib/fuzzy";
import { basenameOf, parentOf } from "./lib/wikilinks";
import type { VaultSearchHit } from "./vault-types";

export interface QuickSwitcherProps {
  root: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rels of all notes. */
  files: readonly string[];
  /** Open an existing note. */
  onSelect: (rel: string) => void;
  /** Create a note named `name` (no ".md") in the default location and open it. */
  onCreate: (name: string) => void;
  /** Start in full-text search mode (Ctrl+Shift+F) instead of file switching (Ctrl+O). */
  initialMode?: "files" | "search";
  /** Search mode only: open a note scrolled to a specific line, when the caller wants that. */
  onSelectLine?: (rel: string, line: number) => void;
  /** Query to start with when opened (e.g. a clicked `#tag`). */
  initialQuery?: string;
}

type SwitcherMode = "files" | "search";

function rankFiles(files: readonly string[], query: string): string[] {
  if (!query.trim()) return [...files];
  const scored: { rel: string; score: number }[] = [];
  for (const rel of files) {
    const baseScore = fuzzyScore(query, basenameOf(rel));
    const pathScore = fuzzyScore(query, rel);
    const score = baseScore !== null ? baseScore * 2 : pathScore;
    if (score !== null) scored.push({ rel, score });
  }
  scored.sort((a, b) => b.score - a.score || a.rel.length - b.rel.length);
  return scored.map((s) => s.rel);
}

function groupHits(
  hits: readonly VaultSearchHit[],
): [string, VaultSearchHit[]][] {
  const order: string[] = [];
  const bySrc = new Map<string, VaultSearchHit[]>();
  for (const hit of hits) {
    if (!bySrc.has(hit.rel)) {
      bySrc.set(hit.rel, []);
      order.push(hit.rel);
    }
    bySrc.get(hit.rel)!.push(hit);
  }
  return order.map((rel) => [rel, bySrc.get(rel)!]);
}

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/30 text-inherit">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-11 font-medium transition-colors",
        active
          ? "bg-white/[0.1] text-white/90"
          : "text-white/40 hover:text-white/70",
      )}
    >
      {label}
    </button>
  );
}

export function QuickSwitcher({
  root,
  open,
  onOpenChange,
  files,
  onSelect,
  onCreate,
  initialMode = "files",
  onSelectLine,
  initialQuery = "",
}: QuickSwitcherProps) {
  const [mode, setMode] = useState<SwitcherMode>(initialMode);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setQuery(initialQuery);
    setDebouncedQuery(initialQuery);
  }, [open, initialMode, initialQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  const searchQuery = useVaultSearch(
    root,
    mode === "search" ? debouncedQuery : "",
  );

  const ranked = useMemo(() => rankFiles(files, query), [files, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return files.some((f) => basenameOf(f).toLowerCase() === q);
  }, [files, query]);

  const groups = useMemo(
    () => groupHits(searchQuery.data ?? []),
    [searchQuery.data],
  );

  function selectFile(rel: string) {
    onSelect(rel);
    onOpenChange(false);
  }

  function selectHit(rel: string, line: number) {
    if (onSelectLine) onSelectLine(rel, line);
    else onSelect(rel);
    onOpenChange(false);
  }

  function createFromQuery() {
    const name = query.trim();
    if (!name) return;
    onCreate(name);
    onOpenChange(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Tab") {
      e.preventDefault();
      setMode((m) => (m === "files" ? "search" : "files"));
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (mode === "files") createFromQuery();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Quick switcher</DialogTitle>
        <DialogDescription>
          Jump to a note or search your vault
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        showCloseButton={false}
        className="top-[20vh] translate-y-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <Command shouldFilter={false} onKeyDown={handleKeyDown}>
          <div className="flex items-center gap-1 border-b border-white/10 px-2 pt-2 pb-1.5">
            <ModeTab
              label="Files"
              active={mode === "files"}
              onClick={() => setMode("files")}
            />
            <ModeTab
              label="Search"
              active={mode === "search"}
              onClick={() => setMode("search")}
            />
          </div>
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={
              mode === "files" ? "Jump to note…" : "Search your vault…"
            }
          />
          <CommandList>
            {mode === "files" ? (
              <>
                <CommandEmpty>No matching notes</CommandEmpty>
                {ranked.map((rel) => {
                  const folder = parentOf(rel);
                  return (
                    <CommandItem
                      key={rel}
                      value={rel}
                      onSelect={() => selectFile(rel)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{basenameOf(rel)}</p>
                        {folder && (
                          <p className="truncate text-11 text-white/40">
                            {folder}
                          </p>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
                {/* Last, so Enter opens the best match (Ctrl+Enter always creates). */}
                {!exactMatch && query.trim() && (
                  <CommandItem
                    value={`__create__:${query}`}
                    onSelect={createFromQuery}
                  >
                    <FilePlus className="size-4 text-white/40" />
                    Create note &ldquo;{query.trim()}&rdquo;
                  </CommandItem>
                )}
              </>
            ) : (
              <>
                <CommandEmpty>
                  {debouncedQuery.trim()
                    ? "No results"
                    : "Type to search your vault"}
                </CommandEmpty>
                {groups.map(([rel, hits]) => (
                  <CommandGroup key={rel} heading={basenameOf(rel)}>
                    {hits.map((hit) => (
                      <CommandItem
                        key={`${rel}:${hit.line}`}
                        value={`${rel}:${hit.line}`}
                        onSelect={() => selectHit(rel, hit.line)}
                      >
                        <span className="truncate text-white/70">
                          {highlightMatch(hit.text, debouncedQuery)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

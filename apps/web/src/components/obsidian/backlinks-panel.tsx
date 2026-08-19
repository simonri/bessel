import { useMemo } from "react";
import { basenameOf, resolveLink } from "./lib/wikilinks";
import type { VaultIndex } from "./vault-types";

export interface BacklinksPanelProps {
  root: string;
  /** Rel of the note whose backlinks to show. */
  rel: string;
  files: readonly string[];
  index: VaultIndex | undefined;
  /** Open a note, optionally scrolled to a 0-based line. */
  onOpenNote: (rel: string, line?: number) => void;
}

interface BacklinkGroup {
  src: string;
  lines: number[];
}

function groupBacklinks(
  index: VaultIndex | undefined,
  files: readonly string[],
  rel: string,
): BacklinkGroup[] {
  if (!index) return [];
  const bySrc = new Map<string, number[]>();
  for (const [src, meta] of Object.entries(index.files)) {
    if (src === rel) continue;
    for (const link of meta.links) {
      if (resolveLink(files, src, link.target) !== rel) continue;
      const lines = bySrc.get(src) ?? [];
      lines.push(link.line);
      bySrc.set(src, lines);
    }
  }
  return Array.from(bySrc.entries())
    .map(([src, lines]) => ({ src, lines }))
    .sort((a, b) => basenameOf(a.src).localeCompare(basenameOf(b.src)));
}

export function BacklinksPanel({
  rel,
  files,
  index,
  onOpenNote,
}: BacklinksPanelProps) {
  const groups = useMemo(
    () => groupBacklinks(index, files, rel),
    [index, files, rel],
  );
  const count = useMemo(
    () => groups.reduce((n, g) => n + g.lines.length, 0),
    [groups],
  );

  if (groups.length === 0) {
    return <div className="p-3 text-xs text-white/40">No backlinks</div>;
  }

  return (
    <div className="overflow-y-auto py-2">
      <p className="px-3 pb-1.5 text-11 font-medium tracking-wide text-white/40 uppercase">
        Backlinks ({count})
      </p>
      {groups.map((group) => (
        <div key={group.src} className="mb-1">
          <p className="truncate px-3 py-1 text-xs font-medium text-white/70">
            {basenameOf(group.src)}
          </p>
          {group.lines.map((line) => (
            <button
              key={line}
              type="button"
              onClick={() => onOpenNote(group.src, line)}
              className="block w-full truncate py-1 pr-3 pl-5 text-left text-11 text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80"
            >
              Line {line + 1}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

import type { VaultIndex } from "./vault-types";

export interface OutlinePanelProps {
  rel: string;
  index: VaultIndex | undefined;
  /** Jump the editor/reader to a 0-based line. */
  onJump: (line: number) => void;
}

export function OutlinePanel({ rel, index, onJump }: OutlinePanelProps) {
  const headings = index?.files[rel]?.headings ?? [];

  if (headings.length === 0) {
    return <div className="p-3 text-xs text-white/40">No headings</div>;
  }

  return (
    <div className="overflow-y-auto py-2">
      {headings.map((h) => (
        <button
          key={h.line}
          type="button"
          onClick={() => onJump(h.line)}
          style={{ paddingLeft: `${(h.level - 1) * 12 + 12}px` }}
          className="block w-full truncate py-1 pr-3 text-left text-xs text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/90"
        >
          {h.text}
        </button>
      ))}
    </div>
  );
}

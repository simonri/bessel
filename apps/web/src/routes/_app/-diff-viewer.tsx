import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildHighlightMap,
  detectLang,
  type HighlightToken,
  parseDiff,
} from "./-git-diff-utils";

// ── Constants ──────────────────────────────────────────────────────────────────

const EXT_COLOR: Record<string, string> = {
  ts: "bg-blue-400",
  tsx: "bg-blue-400",
  js: "bg-yellow-400",
  jsx: "bg-yellow-400",
  mjs: "bg-yellow-400",
  py: "bg-green-400",
  css: "bg-purple-400",
  scss: "bg-purple-400",
  less: "bg-purple-400",
  json: "bg-yellow-300",
  yaml: "bg-sky-300",
  yml: "bg-sky-300",
  md: "bg-sky-400",
  html: "bg-orange-400",
  htm: "bg-orange-400",
  sql: "bg-sky-400",
  csv: "bg-emerald-400",
  rs: "bg-orange-500",
  go: "bg-cyan-400",
  rb: "bg-red-400",
  sh: "bg-neutral-400",
  bash: "bg-neutral-400",
  toml: "bg-amber-400",
  lock: "bg-neutral-500",
};

const SKIP_PREFIXES = [
  "diff --git",
  "index ",
  "--- ",
  "+++ ",
  "new file mode",
  "deleted file mode",
  "old mode",
  "new mode",
  "similarity index",
  "rename from",
  "rename to",
];

function HighlightedLine({ tokens }: { tokens: HighlightToken[] }) {
  return (
    <>
      {tokens.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens for a line never reorder
        <span key={i} style={t.color ? { color: t.color } : undefined}>
          {t.content}
        </span>
      ))}
    </>
  );
}

// ── DiffViewer ─────────────────────────────────────────────────────────────────

// Every row renders at exactly this height (leading-5, py-0) — that uniformity
// is what makes the plain scrollTop-based windowing below correct.
const ROW_HEIGHT = 20;
const OVERSCAN_ROWS = 20;

// memo: the parent GitStatus re-renders on every 8s poll's isFetching flip;
// the diff strings only change identity when the content actually changed
// (TanStack Query structural sharing), so this skips those reconciles.
export const DiffViewer = memo(function DiffViewer({
  diff,
  filename,
  oldContent,
  newContent,
}: {
  diff: string;
  filename?: string;
  oldContent: string;
  newContent: string;
}) {
  const lines = useMemo(() => parseDiff(diff), [diff]);
  const lang = useMemo(() => detectLang(filename), [filename]);

  // GitHub sizes the gutter once, from the widest line number in the whole
  // file — fixed for the life of the diff. Without table-layout: fixed below,
  // auto layout instead re-measures from whatever rows the windowing below
  // currently has mounted, so the gutter width jitters as you scroll past
  // rows with more/fewer digits.
  const gutterDigits = useMemo(() => {
    let max = 0;
    for (const line of lines) {
      if (line.oldNum && line.oldNum > max) max = line.oldNum;
      if (line.newNum && line.newNum > max) max = line.newNum;
    }
    return Math.max(2, String(max).length);
  }, [lines]);
  // +0.75rem covers the pl-2/pr-1 padding on the gutter cells (table-fixed
  // treats the col width as the cell's full outer width, padding included).
  const gutterWidth = `calc(${gutterDigits}ch + 0.75rem)`;

  // Tokenizing is async (Shiki loads its grammars/theme once, lazily), so the
  // diff renders as plain text immediately and re-renders colored once ready.
  const [highlightMap, setHighlightMap] = useState<
    Map<number, HighlightToken[]>
  >(new Map());
  useEffect(() => {
    let cancelled = false;
    setHighlightMap(new Map());
    buildHighlightMap(lines, lang, oldContent, newContent).then((map) => {
      if (!cancelled) setHighlightMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [lines, lang, oldContent, newContent]);

  // Rows that actually render, with their original index preserved so
  // highlightMap lookups (keyed on the unfiltered index) still line up.
  const rows = useMemo(
    () =>
      lines
        .map((line, i) => ({ line, key: i }))
        .filter(
          ({ line }) =>
            line.type !== "file-header" ||
            (!!line.content.trim() &&
              !SKIP_PREFIXES.some((p) => line.content.startsWith(p))),
        ),
    [lines],
  );

  // Window the table to the visible rows plus overscan — a lockfile or
  // generated-file diff can run tens of thousands of lines, and mounting a
  // <tr> per line freezes the widget. Spacer rows keep scroll geometry exact.
  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const updateRange = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const start = Math.max(
      0,
      Math.floor(el.scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS,
    );
    const end = Math.min(
      rows.length,
      Math.ceil((el.scrollTop + el.clientHeight) / ROW_HEIGHT) + OVERSCAN_ROWS,
    );
    setRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );
  }, [rows.length]);

  useEffect(() => {
    updateRange();
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateRange);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateRange]);

  const hasContent = lines.some(
    (l) => l.type !== "file-header" || l.content.includes("Binary"),
  );
  if (!hasContent) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-white/50">
        No diff available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={updateRange}
      className="h-full overflow-auto font-mono text-xs leading-5"
    >
      <table className="diff-viewer min-w-full table-fixed border-collapse">
        <colgroup>
          <col style={{ width: gutterWidth }} />
          <col style={{ width: gutterWidth }} />
          <col />
        </colgroup>
        <tbody>
          {range.start > 0 && (
            <tr style={{ height: range.start * ROW_HEIGHT }} />
          )}
          {rows.slice(range.start, range.end).map(({ line, key: i }) => {
            if (line.type === "file-header") {
              return (
                <tr key={i} style={{ height: ROW_HEIGHT }}>
                  <td
                    colSpan={3}
                    className="select-none border-l-2 border-transparent px-2 py-0 italic text-white/50 whitespace-pre"
                  >
                    {line.content}
                  </td>
                </tr>
              );
            }
            if (line.type === "hunk") {
              return (
                <tr key={i} className="bg-sky-500/10">
                  <td className="select-none border-l-2 border-sky-500/40 py-0 pl-2 pr-1 text-right text-sky-400/50" />
                  <td className="select-none py-0 pl-2 pr-1 text-right text-sky-400/50" />
                  <td className="py-0 pl-2 font-medium text-sky-300/90 whitespace-pre">
                    {line.content}
                  </td>
                </tr>
              );
            }

            const tokens = highlightMap.get(i);

            if (line.type === "add") {
              return (
                <tr key={i} className="bg-emerald-500/10">
                  <td className="select-none border-l-2 border-emerald-500/60 py-0 pl-2 pr-1 text-right text-emerald-400/40">
                    {" "}
                  </td>
                  <td className="select-none py-0 pl-2 pr-1 text-right text-emerald-400/40">
                    {line.newNum}
                  </td>
                  <td className="py-0 pl-1 whitespace-pre">
                    <span className="select-none font-semibold text-emerald-400">
                      +
                    </span>
                    {tokens ? (
                      <HighlightedLine tokens={tokens} />
                    ) : (
                      <span className="text-emerald-200">{line.content}</span>
                    )}
                  </td>
                </tr>
              );
            }
            if (line.type === "remove") {
              return (
                <tr key={i} className="bg-red-500/10">
                  <td className="select-none border-l-2 border-red-500/60 py-0 pl-2 pr-1 text-right text-red-400/40">
                    {line.oldNum}
                  </td>
                  <td className="select-none py-0 pl-2 pr-1 text-right text-red-400/40">
                    {" "}
                  </td>
                  <td className="py-0 pl-1 whitespace-pre">
                    <span className="select-none font-semibold text-red-400">
                      -
                    </span>
                    {tokens ? (
                      <HighlightedLine tokens={tokens} />
                    ) : (
                      <span className="text-red-200">{line.content}</span>
                    )}
                  </td>
                </tr>
              );
            }
            if (line.type === "no-newline") {
              return (
                <tr key={i}>
                  <td
                    colSpan={3}
                    className="border-l-2 border-transparent py-0 pl-2 text-white/50 whitespace-pre"
                  >
                    {line.content}
                  </td>
                </tr>
              );
            }
            // context
            return (
              <tr key={i} className="hover:bg-white/[0.03]">
                <td className="select-none border-l-2 border-transparent py-0 pl-2 pr-1 text-right text-white/50">
                  {line.oldNum}
                </td>
                <td className="select-none py-0 pl-2 pr-1 text-right text-white/50">
                  {line.newNum}
                </td>
                <td className="py-0 pl-1 whitespace-pre">
                  <span className="select-none text-white/20"> </span>
                  {tokens ? (
                    <HighlightedLine tokens={tokens} />
                  ) : (
                    <span className="text-white/70">{line.content}</span>
                  )}
                </td>
              </tr>
            );
          })}
          {range.end < rows.length && (
            <tr style={{ height: (rows.length - range.end) * ROW_HEIGHT }} />
          )}
        </tbody>
      </table>
    </div>
  );
});

// ── FileTypeIndicator ──────────────────────────────────────────────────────────

export function FileTypeDot({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return (
    <span
      className={`size-[7px] shrink-0 rounded-sm ${EXT_COLOR[ext] ?? "bg-white/20"}`}
    />
  );
}

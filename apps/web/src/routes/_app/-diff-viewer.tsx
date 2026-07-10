import { useEffect, useMemo, useState } from "react";
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

export function DiffViewer({
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
    <div className="h-full overflow-auto font-mono text-xs leading-5">
      <table className="diff-viewer min-w-full border-collapse">
        <colgroup>
          <col style={{ width: "2.5rem" }} />
          <col style={{ width: "2.5rem" }} />
          <col />
        </colgroup>
        <tbody>
          {lines.map((line, i) => {
            if (line.type === "file-header") {
              if (!line.content.trim()) return null;
              if (SKIP_PREFIXES.some((p) => line.content.startsWith(p)))
                return null;
              return (
                <tr key={i}>
                  <td
                    colSpan={3}
                    className="select-none border-l-2 border-transparent px-2 py-0.5 italic text-white/50 whitespace-pre"
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
        </tbody>
      </table>
    </div>
  );
}

// ── FileTypeIndicator ──────────────────────────────────────────────────────────

export function FileTypeDot({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return (
    <span
      className={`size-[7px] shrink-0 rounded-sm ${EXT_COLOR[ext] ?? "bg-white/20"}`}
    />
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, GitBranch, Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import hljs from "highlight.js/lib/core";
import langBash from "highlight.js/lib/languages/bash";
import langCss from "highlight.js/lib/languages/css";
import langGo from "highlight.js/lib/languages/go";
import langJson from "highlight.js/lib/languages/json";
import langJavascript from "highlight.js/lib/languages/javascript";
import langMarkdown from "highlight.js/lib/languages/markdown";
import langPython from "highlight.js/lib/languages/python";
import langRust from "highlight.js/lib/languages/rust";
import langSql from "highlight.js/lib/languages/sql";
import langTypescript from "highlight.js/lib/languages/typescript";
import langXml from "highlight.js/lib/languages/xml";
import langYaml from "highlight.js/lib/languages/yaml";
import "highlight.js/styles/atom-one-dark.css";
import { listProjectsV1ProjectsGetOptions, type ProjectSchema } from "@metron/client";
import { client } from "@/lib/client";

type ProjectWithPath = Omit<ProjectSchema, "path"> & { path: string };

hljs.registerLanguage("bash", langBash);
hljs.registerLanguage("css", langCss);
hljs.registerLanguage("go", langGo);
hljs.registerLanguage("json", langJson);
hljs.registerLanguage("javascript", langJavascript);
hljs.registerLanguage("markdown", langMarkdown);
hljs.registerLanguage("python", langPython);
hljs.registerLanguage("rust", langRust);
hljs.registerLanguage("sql", langSql);
hljs.registerLanguage("typescript", langTypescript);
hljs.registerLanguage("html", langXml);
hljs.registerLanguage("xml", langXml);
hljs.registerLanguage("yaml", langYaml);

// ── Types ──────────────────────────────────────────────────────────────────────

interface GitFileEntry {
  path: string;
  originalPath?: string;
  status: string;
}

interface GitStatusData {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: GitFileEntry[];
}

interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  refs: string;
}

interface SelectedFile {
  file: GitFileEntry;
  staged: boolean;
  untracked: boolean;
}

type DiffLineType = "file-header" | "hunk" | "add" | "remove" | "context" | "no-newline";

interface ParsedLine {
  type: DiffLineType;
  content: string;
  oldNum?: number;
  newNum?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  M: "text-amber-400",
  A: "text-emerald-400",
  D: "text-red-400",
  R: "text-blue-400",
  C: "text-purple-400",
  U: "text-yellow-400",
  "?": "text-emerald-400",
};

const EXT_COLOR: Record<string, string> = {
  ts: "bg-blue-400", tsx: "bg-blue-400",
  js: "bg-yellow-400", jsx: "bg-yellow-400", mjs: "bg-yellow-400",
  py: "bg-green-400",
  css: "bg-purple-400", scss: "bg-purple-400", less: "bg-purple-400",
  json: "bg-yellow-300", yaml: "bg-sky-300", yml: "bg-sky-300",
  md: "bg-sky-400",
  html: "bg-orange-400", htm: "bg-orange-400",
  sql: "bg-sky-400",
  csv: "bg-emerald-400",
  rs: "bg-orange-500",
  go: "bg-cyan-400",
  rb: "bg-red-400",
  sh: "bg-neutral-400", bash: "bg-neutral-400",
  toml: "bg-amber-400", lock: "bg-neutral-500",
};

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python",
  css: "css", scss: "css",
  json: "json",
  md: "markdown", mdx: "markdown",
  sql: "sql",
  go: "go",
  rs: "rust",
  html: "html", htm: "html", xml: "xml", svg: "xml",
  sh: "bash", bash: "bash", zsh: "bash",
  yaml: "yaml", yml: "yaml",
};

const SKIP_PREFIXES = [
  "diff --git", "index ", "--- ", "+++ ",
  "new file mode", "deleted file mode", "old mode", "new mode",
  "similarity index", "rename from", "rename to",
];

// ── Diff parsing ───────────────────────────────────────────────────────────────

function parseDiff(raw: string): ParsedLine[] {
  const result: ParsedLine[] = [];
  let oldNum = 0;
  let newNum = 0;

  for (const line of raw.split("\n")) {
    if (line.startsWith("@@")) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) { oldNum = parseInt(m[1], 10); newNum = parseInt(m[2], 10); }
      result.push({ type: "hunk", content: line });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      result.push({ type: "add", content: line.slice(1), newNum: newNum++ });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      result.push({ type: "remove", content: line.slice(1), oldNum: oldNum++ });
    } else if (line.startsWith(" ")) {
      result.push({ type: "context", content: line.slice(1), oldNum: oldNum++, newNum: newNum++ });
    } else if (line.startsWith("\\")) {
      result.push({ type: "no-newline", content: line });
    } else {
      result.push({ type: "file-header", content: line });
    }
  }

  return result;
}

// ── Syntax highlighting ────────────────────────────────────────────────────────

function detectLang(filepath: string | undefined): string | undefined {
  if (!filepath) return undefined;
  const ext = filepath.split("/").pop()?.split(".").pop()?.toLowerCase();
  return ext ? EXT_LANG[ext] : undefined;
}

// Splits hljs-highlighted HTML into per-line strings while rebalancing spans
// so multi-line tokens (block comments, template literals) render correctly.
function splitHighlightedLines(html: string): string[] {
  const rawLines = html.split("\n");
  const lines: string[] = [];
  const openStack: string[] = [];
  const tagRe = /<span([^>]*)>|<\/span>/g;

  for (const rawLine of rawLines) {
    let line = openStack.join("") + rawLine;
    let m: RegExpExecArray | null;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(rawLine)) !== null) {
      if (m[0].startsWith("</")) {
        openStack.pop();
      } else {
        openStack.push(`<span${m[1]}>`);
      }
    }
    line += "</span>".repeat(openStack.length);
    lines.push(line);
  }

  return lines;
}

// Highlighting a hunk in isolation misreads any multi-line construct (block
// comment, triple-quoted string, template literal, JSX) that opens or closes
// outside the visible context lines — hljs has no way to know it's mid-token.
// Highlighting the full old/new file content once and slicing by line number
// gives every token its real surrounding context, so it can't break on a hunk
// boundary. Falls back to per-line highlighting (old behavior) if full file
// content isn't available, e.g. for a rename with no matching path at HEAD.
function buildHighlightMap(
  lines: ParsedLine[],
  lang: string | undefined,
  oldContent: string,
  newContent: string,
): Map<number, string> {
  const result = new Map<number, string>();
  if (!lang) return result;

  const highlightLines = (content: string): string[] =>
    content ? splitHighlightedLines(hljs.highlight(content, { language: lang, ignoreIllegals: true }).value) : [];

  const oldLines = highlightLines(oldContent);
  const newLines = highlightLines(newContent);

  const fallback: { idx: number; content: string }[] = [];

  lines.forEach((line, idx) => {
    if (line.type === "add" && line.newNum !== undefined) {
      const hl = newLines[line.newNum - 1];
      if (hl !== undefined) result.set(idx, hl);
      else fallback.push({ idx, content: line.content });
    } else if (line.type === "remove" && line.oldNum !== undefined) {
      const hl = oldLines[line.oldNum - 1];
      if (hl !== undefined) result.set(idx, hl);
      else fallback.push({ idx, content: line.content });
    } else if (line.type === "context" && line.newNum !== undefined) {
      // Prefer new-file highlighting for context lines — matches what's on disk.
      const hl = newLines[line.newNum - 1] ?? oldLines[(line.oldNum ?? 0) - 1];
      if (hl !== undefined) result.set(idx, hl);
      else fallback.push({ idx, content: line.content });
    }
  });

  // Full file content wasn't available (e.g. rename source path 404s at HEAD) —
  // highlight whatever we have per-line, independently, as a best effort.
  if (fallback.length > 0) {
    for (const { idx, content } of fallback) {
      result.set(idx, hljs.highlight(content, { language: lang, ignoreIllegals: true }).value);
    }
  }

  return result;
}

// ── DiffViewer ─────────────────────────────────────────────────────────────────

function DiffViewer({
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
  const highlightMap = useMemo(
    () => buildHighlightMap(lines, lang, oldContent, newContent),
    [lines, lang, oldContent, newContent],
  );

  const hasContent = lines.some((l) => l.type !== "file-header" || l.content.includes("Binary"));
  if (!hasContent) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-white/25">
        No diff available
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto font-mono text-xs leading-5">
      {/* atom-one-dark's comment/mono tones assume a lighter (#282c34) editor
          background; against our near-black diff rows they read as almost
          invisible, so brighten just that token here. */}
      <style>{`
        .diff-viewer .hljs-comment, .diff-viewer .hljs-quote { color: #7f8899; }
      `}</style>
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
              if (SKIP_PREFIXES.some((p) => line.content.startsWith(p))) return null;
              return (
                <tr key={i}>
                  <td colSpan={3} className="select-none border-l-2 border-transparent px-2 py-0.5 italic text-white/40 whitespace-pre">
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
                  <td className="py-0 pl-2 font-medium text-sky-300/90 whitespace-pre">{line.content}</td>
                </tr>
              );
            }

            const hlHtml = highlightMap.get(i);

            if (line.type === "add") {
              return (
                <tr key={i} className="bg-emerald-500/10">
                  <td className="select-none border-l-2 border-emerald-500/60 py-0 pl-2 pr-1 text-right text-emerald-400/40"> </td>
                  <td className="select-none py-0 pl-2 pr-1 text-right text-emerald-400/40">{line.newNum}</td>
                  <td className="py-0 pl-1 whitespace-pre">
                    <span className="select-none font-semibold text-emerald-400">+</span>
                    {hlHtml
                      ? <span dangerouslySetInnerHTML={{ __html: hlHtml }} />
                      : <span className="text-emerald-200">{line.content}</span>}
                  </td>
                </tr>
              );
            }
            if (line.type === "remove") {
              return (
                <tr key={i} className="bg-red-500/10">
                  <td className="select-none border-l-2 border-red-500/60 py-0 pl-2 pr-1 text-right text-red-400/40">{line.oldNum}</td>
                  <td className="select-none py-0 pl-2 pr-1 text-right text-red-400/40"> </td>
                  <td className="py-0 pl-1 whitespace-pre">
                    <span className="select-none font-semibold text-red-400">-</span>
                    {hlHtml
                      ? <span dangerouslySetInnerHTML={{ __html: hlHtml }} />
                      : <span className="text-red-200">{line.content}</span>}
                  </td>
                </tr>
              );
            }
            if (line.type === "no-newline") {
              return (
                <tr key={i}>
                  <td colSpan={3} className="border-l-2 border-transparent py-0 pl-2 text-white/35 whitespace-pre">{line.content}</td>
                </tr>
              );
            }
            // context
            return (
              <tr key={i} className="hover:bg-white/[0.03]">
                <td className="select-none border-l-2 border-transparent py-0 pl-2 pr-1 text-right text-white/35">{line.oldNum}</td>
                <td className="select-none py-0 pl-2 pr-1 text-right text-white/35">{line.newNum}</td>
                <td className="py-0 pl-1 whitespace-pre">
                  <span className="select-none text-white/20"> </span>
                  {hlHtml
                    ? <span dangerouslySetInnerHTML={{ __html: hlHtml }} />
                    : <span className="text-white/70">{line.content}</span>}
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

function FileTypeDot({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return (
    <span className={`size-[7px] shrink-0 rounded-sm ${EXT_COLOR[ext] ?? "bg-white/20"}`} />
  );
}

// ── FileItem ───────────────────────────────────────────────────────────────────

function FileItem({
  file,
  isSelected,
  staged,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
}: {
  file: GitFileEntry;
  isSelected: boolean;
  staged: boolean;
  onSelect: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
}) {
  const parts = file.path.split("/");
  const name = parts.pop() ?? file.path;
  const dir = parts.join("/");
  const statusBadge = file.status === "?" ? "U" : file.status;

  return (
    <div
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-1.5 py-[3px] pl-4 pr-2 transition-colors ${
        isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
      }`}
    >
      <FileTypeDot filename={name} />

      <span className="min-w-0 flex-1 truncate text-xs">
        <span className="text-white/80">{name}</span>
        {dir && <span className="ml-1.5 text-white/30">{dir}</span>}
      </span>

      {onDiscard && (
        <button
          onClick={(e) => { e.stopPropagation(); onDiscard(); }}
          title="Discard changes"
          className="flex size-4 shrink-0 items-center justify-center rounded text-white/25 opacity-0 transition-opacity hover:text-red-400/70 group-hover:opacity-100"
        >
          <Trash2 className="size-3" />
        </button>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          staged ? onUnstage?.() : onStage?.();
        }}
        className="flex size-4 shrink-0 items-center justify-center rounded text-white/25 opacity-0 transition-opacity hover:text-white/70 group-hover:opacity-100"
      >
        {staged ? <Minus className="size-3" /> : <Plus className="size-3" />}
      </button>

      <span className={`w-3 shrink-0 text-center text-[10px] font-semibold ${STATUS_COLOR[file.status] ?? "text-white/35"}`}>
        {statusBadge}
      </span>
    </div>
  );
}

// ── SectionHeader ──────────────────────────────────────────────────────────────

function SectionHeader({
  label,
  count,
  open,
  onToggle,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onDiscardAll?: () => void;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div
      onClick={onToggle}
      className="group flex cursor-pointer items-center gap-1 px-2 py-[5px] hover:bg-white/[0.03]"
    >
      <Chevron className="size-3 shrink-0 text-white/40" />
      <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        {label}
      </span>
      {count > 0 && (
        <span className="rounded px-1 text-[10px] text-white/30">{count}</span>
      )}
      <div
        className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {onStageAll && (
          <button
            onClick={onStageAll}
            title="Stage all"
            className="flex size-4 items-center justify-center rounded text-white/30 hover:text-white/70"
          >
            <Plus className="size-3" />
          </button>
        )}
        {onUnstageAll && (
          <button
            onClick={onUnstageAll}
            title="Unstage all"
            className="flex size-4 items-center justify-center rounded text-white/30 hover:text-white/70"
          >
            <Minus className="size-3" />
          </button>
        )}
        {onDiscardAll && (
          <button
            onClick={onDiscardAll}
            title="Discard all changes"
            className="flex size-4 items-center justify-center rounded text-white/30 hover:text-red-400/70"
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── CommitItem ─────────────────────────────────────────────────────────────────

function shortenRelDate(rel: string): string {
  return rel
    .replace(/(\d+) seconds? ago/, "$1s ago")
    .replace(/(\d+) minutes? ago/, "$1m ago")
    .replace(/(\d+) hours? ago/, "$1h ago")
    .replace(/(\d+) days? ago/, "$1d ago")
    .replace(/(\d+) weeks? ago/, "$1w ago")
    .replace(/(\d+) months? ago/, "$1mo ago")
    .replace(/(\d+) years? ago/, "$1y ago");
}

function CommitItem({ commit }: { commit: GitCommit }) {
  const refs = commit.refs ? commit.refs.split(", ").filter(Boolean) : [];

  return (
    <div className="cursor-default px-3 py-1.5 hover:bg-white/[0.04]">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 truncate text-xs leading-tight text-white/70">{commit.subject}</span>
        <span className="shrink-0 whitespace-nowrap text-[10px] text-white/35">{shortenRelDate(commit.date)}</span>
      </div>
      {refs.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {refs.map((ref) => {
            const isHead = ref.startsWith("HEAD");
            const isTag = ref.startsWith("tag:");
            const isRemote = !isHead && !isTag && ref.includes("/");
            return (
              <span
                key={ref}
                className={`inline-block rounded px-1 py-0 text-[9px] font-medium leading-4 ${
                  isHead
                    ? "bg-amber-500/20 text-amber-400/80"
                    : isRemote
                      ? "bg-sky-500/15 text-sky-400/70"
                      : isTag
                        ? "bg-purple-500/15 text-purple-400/70"
                        : "bg-white/10 text-white/50"
                }`}
              >
                {isTag ? ref.slice(5) : ref}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Error extraction ───────────────────────────────────────────────────────────

function extractErrorMessage(error: unknown): string {
  if (!error) return "An error occurred";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const obj = error as Record<string, unknown>;
  if (typeof obj.detail === "string") return obj.detail;
  if (typeof obj.message === "string") return obj.message;
  return "Operation failed";
}

// ── GitStatus (main export) ────────────────────────────────────────────────────

export function GitStatus() {
  const queryClient = useQueryClient();

  const { data: allProjects } = useQuery(listProjectsV1ProjectsGetOptions({ client }));
  const projects = (allProjects ?? []).filter((p): p is ProjectWithPath => p.path != null && !p.ssh_host);

  const [selectedProject, setSelectedProject] = useState<ProjectWithPath | null>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const commitTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(true);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(215);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) =>
      setSidebarWidth(Math.max(160, Math.min(420, startWidth + ev.clientX - startX)));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    if (!selectedProject && projects.length > 0) {
      setSelectedProject(projects[0] ?? null);
    }
  }, [projects, selectedProject]);

  useEffect(() => {
    const el = commitTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [commitMessage]);

  const statusQueryKey = ["git:status", selectedProject?.path];
  const logQueryKey = ["git:log", selectedProject?.path];
  const invalidateStatus = () => queryClient.invalidateQueries({ queryKey: statusQueryKey });
  const invalidateLog = () => queryClient.invalidateQueries({ queryKey: logQueryKey });

  const statusQuery = useQuery<GitStatusData>({
    queryKey: statusQueryKey,
    queryFn: () => window.electron!.git.status(selectedProject!.path),
    enabled: !!selectedProject,
    refetchOnWindowFocus: true,
    refetchInterval: 8000,
  });

  const diffQuery = useQuery<{ diff: string; oldContent: string; newContent: string }>({
    queryKey: ["git:diff", selectedProject?.path, selectedFile?.file.path, selectedFile?.staged, selectedFile?.untracked],
    queryFn: () => window.electron!.git.diff(
      selectedProject!.path,
      selectedFile!.file.path,
      selectedFile!.staged,
      selectedFile!.untracked,
    ),
    enabled: !!selectedProject && !!selectedFile,
  });

  const logQuery = useQuery<GitCommit[]>({
    queryKey: logQueryKey,
    queryFn: () => window.electron!.git.log(selectedProject!.path),
    enabled: !!selectedProject && historyOpen,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  const stageMutation = useMutation({
    mutationFn: (files: string[]) => window.electron!.git.stage(selectedProject!.path, files),
    onSuccess: () => { setError(null); invalidateStatus(); },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const unstageMutation = useMutation({
    mutationFn: (files: string[]) => window.electron!.git.unstage(selectedProject!.path, files),
    onSuccess: () => { setError(null); invalidateStatus(); },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const commitMutation = useMutation({
    mutationFn: (message: string) => window.electron!.git.commit(selectedProject!.path, message),
    onSuccess: () => { setCommitMessage(""); setError(null); setSelectedFile(null); invalidateStatus(); invalidateLog(); },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const pushMutation = useMutation({
    mutationFn: () => window.electron!.git.push(selectedProject!.path),
    onSuccess: () => { setError(null); invalidateStatus(); invalidateLog(); },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const discardMutation = useMutation({
    mutationFn: (files: GitFileEntry[]) => {
      const tracked = files.filter((f) => f.status !== "?").map((f) => f.path);
      const untracked = files.filter((f) => f.status === "?").map((f) => f.path);
      return window.electron!.git.discard(selectedProject!.path, tracked, untracked);
    },
    onSuccess: () => { setError(null); invalidateStatus(); },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const discardWithConfirm = (files: GitFileEntry[]) => {
    const label = files.length === 1 ? `"${files[0]!.path}"` : `${files.length} files`;
    if (window.confirm(`Discard changes to ${label}? This cannot be undone.`)) {
      discardMutation.mutate(files);
    }
  };

  const status = statusQuery.data;
  const changes = [...(status?.unstaged ?? []), ...(status?.untracked ?? [])];
  const staged = status?.staged ?? [];
  const isBusy = stageMutation.isPending || unstageMutation.isPending || commitMutation.isPending || pushMutation.isPending || discardMutation.isPending;
  const canCommit = commitMessage.trim().length > 0 && staged.length > 0 && !commitMutation.isPending;
  const canPush = (status?.ahead ?? 0) > 0 && !pushMutation.isPending;
  const branch = status?.branch ?? "";

  if (projects.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <GitBranch className="size-8 text-white/15" />
        <p className="text-sm text-white/40">No projects configured</p>
        <p className="text-xs text-white/25">Add a project via the folder icon in the top bar</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Top bar: project + branch ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
        <select
          value={selectedProject?.id ?? ""}
          onChange={(e) => {
            const p = projects.find((p) => p.id === e.target.value) ?? null;
            setSelectedProject(p);
            setSelectedFile(null);
            setError(null);
          }}
          className="min-w-0 flex-1 cursor-pointer truncate bg-transparent text-xs text-white/65 outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id} className="bg-neutral-900">{p.name}</option>
          ))}
        </select>

        {status && (
          <div className="flex shrink-0 items-center gap-1 text-[11px] text-white/50">
            <GitBranch className="size-3" />
            <span className="max-w-[72px] truncate">{branch}</span>
            {(status.ahead ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-amber-400/70">
                <ArrowUp className="size-2.5" />{status.ahead}
              </span>
            )}
            {(status.behind ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-sky-400/70">
                <ArrowDown className="size-2.5" />{status.behind}
              </span>
            )}
          </div>
        )}

        <button
          onClick={() => statusQuery.refetch()}
          disabled={statusQuery.isFetching || isBusy}
          className="shrink-0 text-white/25 transition-colors hover:text-white/60 disabled:opacity-40"
        >
          <RefreshCw className={`size-3 ${statusQuery.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Left panel ── */}
        <div className="flex shrink-0 flex-col overflow-hidden" style={{ width: sidebarWidth }}>

          {/* Commit area — at top, like VS Code */}
          <div className="shrink-0 space-y-1.5 border-b border-white/[0.06] p-2">
            {error && (
              <p className="truncate text-[10px] text-red-400/80" title={error}>{error}</p>
            )}
            <textarea
              ref={commitTextareaRef}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Message"
              rows={1}
              className="w-full resize-none overflow-hidden rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white/80 placeholder:text-white/20 outline-none transition-colors focus:border-white/20"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  if (canCommit) commitMutation.mutate(commitMessage);
                }
              }}
            />
            <div className="flex gap-1">
              <button
                onClick={() => commitMutation.mutate(commitMessage)}
                disabled={!canCommit}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/[0.08] py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white disabled:cursor-default disabled:opacity-25"
              >
                <Check className="size-3" />
                {commitMutation.isPending ? "Committing…" : "Commit"}
              </button>
              <button
                onClick={() => pushMutation.mutate()}
                disabled={!canPush}
                title={`Push ${status?.ahead ?? 0} commit${(status?.ahead ?? 0) === 1 ? "" : "s"} to remote`}
                className="flex items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70 disabled:cursor-default disabled:opacity-25"
              >
                {pushMutation.isPending ? <RefreshCw className="size-3 animate-spin" /> : <ArrowUp className="size-3" />}
              </button>
            </div>
          </div>

          {/* File list */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {statusQuery.isLoading ? (
              <div className="flex h-12 items-center justify-center">
                <div className="size-3.5 animate-spin rounded-full border border-white/20 border-t-white/50" />
              </div>
            ) : (
              <>
                <SectionHeader
                  label="Staged Changes"
                  count={staged.length}
                  open={stagedOpen}
                  onToggle={() => setStagedOpen((o) => !o)}
                  onUnstageAll={staged.length > 0 ? () => unstageMutation.mutate(staged.map((f) => f.path)) : undefined}
                />
                {stagedOpen && (
                  <>
                    {staged.length === 0 && (
                      <p className="py-1 pl-8 text-xs text-white/20">Nothing staged</p>
                    )}
                    {staged.map((file) => (
                      <FileItem
                        key={`s:${file.path}`}
                        file={file}
                        isSelected={!!selectedFile?.staged && selectedFile.file.path === file.path}
                        staged={true}
                        onSelect={() => setSelectedFile({ file, staged: true, untracked: false })}
                        onUnstage={() => unstageMutation.mutate([file.path])}
                      />
                    ))}
                  </>
                )}

                <SectionHeader
                  label="Changes"
                  count={changes.length}
                  open={changesOpen}
                  onToggle={() => setChangesOpen((o) => !o)}
                  onStageAll={changes.length > 0 ? () => stageMutation.mutate(changes.map((f) => f.path)) : undefined}
                  onDiscardAll={changes.length > 0 ? () => discardWithConfirm(changes) : undefined}
                />
                {changesOpen && (
                  <>
                    {changes.length === 0 && (
                      <p className="py-1 pl-8 text-xs text-white/20">No changes</p>
                    )}
                    {changes.map((file) => (
                      <FileItem
                        key={`u:${file.path}`}
                        file={file}
                        isSelected={!selectedFile?.staged && selectedFile?.file.path === file.path}
                        staged={false}
                        onSelect={() => setSelectedFile({ file, staged: false, untracked: file.status === "?" })}
                        onStage={() => stageMutation.mutate([file.path])}
                        onDiscard={() => discardWithConfirm([file])}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* History — pinned to bottom */}
          <div className="shrink-0 border-t border-white/[0.06]">
            <SectionHeader
              label="History"
              count={0}
              open={historyOpen}
              onToggle={() => setHistoryOpen((o) => !o)}
            />
            {historyOpen && (
              <div className="max-h-48 overflow-y-auto">
                {logQuery.isLoading ? (
                  <div className="flex h-12 items-center justify-center">
                    <div className="size-3.5 animate-spin rounded-full border border-white/20 border-t-white/50" />
                  </div>
                ) : (
                  logQuery.data?.map((commit) => (
                    <CommitItem key={commit.hash} commit={commit} />
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Resize handle ── */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="w-1 shrink-0 cursor-col-resize bg-white/[0.05] transition-colors hover:bg-primary-500/40 active:bg-primary-500/60"
        />

        {/* ── Right panel: diff viewer ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedFile ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/45">
                  {selectedFile.file.originalPath
                    ? `${selectedFile.file.originalPath} → ${selectedFile.file.path}`
                    : selectedFile.file.path}
                </span>
                <span className="shrink-0 text-[10px] text-white/25">
                  {selectedFile.staged ? "staged" : selectedFile.untracked ? "untracked" : "unstaged"}
                </span>
              </div>

              {diffQuery.isLoading ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="size-3.5 animate-spin rounded-full border border-white/20 border-t-white/50" />
                </div>
              ) : (
                <DiffViewer
                  diff={diffQuery.data?.diff ?? ""}
                  filename={selectedFile.file.path}
                  oldContent={diffQuery.data?.oldContent ?? ""}
                  newContent={diffQuery.data?.newContent ?? ""}
                />
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-white/20">
              Select a file to view diff
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

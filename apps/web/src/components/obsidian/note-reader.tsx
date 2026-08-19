import {
  type ComponentProps,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import ReactMarkdown, {
  type Components,
  defaultUrlTransform,
} from "react-markdown";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { calloutStyle } from "./lib/callouts";
import { remarkObsidian } from "./lib/remark-obsidian";
import { basenameOf } from "./lib/wikilinks";
import { MarkdownImage } from "./markdown-image";

export interface NoteReaderProps {
  content: string;
  /** Rel of the note being rendered (link resolution is relative to it). */
  fromRel: string;
  /** Rels of all notes, for resolving `[[wikilinks]]`. */
  files: readonly string[];
  /** Vault root, for building `vault://` asset URLs. */
  root: string;
  onOpenLink: (target: string, opts: { newTab: boolean }) => void;
  /** A `- [ ]` checkbox was toggled; `line` is 0-based in `content`. */
  onToggleTask?: (line: number, checked: boolean) => void;
  /** Fetches another note's content, for `![[note]]` embeds. */
  readNote?: (rel: string) => Promise<{ content: string } | null>;
  className?: string;
}

// react-markdown's default URL sanitizer only allows a small protocol
// allowlist (http(s)/mailto/irc(s)/xmpp) and blanks anything else, which
// would silently drop every `vault://` asset URL our own plugin produces.
function urlTransform(url: string): string {
  return url.startsWith("vault://") ? url : defaultUrlTransform(url);
}

export const MARKDOWN_PROSE_CLASS =
  "prose prose-invert prose-sm max-w-none prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-code:before:content-none prose-code:after:content-none prose-a:text-primary prose-blockquote:border-l-white/20 prose-hr:border-white/10";

// ── Shiki (mirrors the setup in routes/_app/-git-diff-utils.ts: the JS regex
// engine skips the ~600 KB oniguruma WASM, grammars load lazily per language).
const CODE_THEME = "one-dark-pro";
const CODE_LANG_LOADERS = {
  bash: () => import("shiki/langs/bash.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
} as const;
type CodeLang = keyof typeof CODE_LANG_LOADERS;

interface CodeToken {
  content: string;
  color?: string;
}

let highlighterPromise: Promise<HighlighterCore> | null = null;
const langLoads = new Map<CodeLang, Promise<void>>();

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [import("shiki/themes/one-dark-pro.mjs")],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighterPromise;
}

async function highlightCode(
  code: string,
  lang: string,
): Promise<CodeToken[][] | null> {
  if (!(lang in CODE_LANG_LOADERS)) return null;
  const key = lang as CodeLang;
  try {
    const highlighter = await getHighlighter();
    let load = langLoads.get(key);
    if (!load) {
      load = highlighter.loadLanguage(CODE_LANG_LOADERS[key]);
      langLoads.set(key, load);
    }
    await load;
    return highlighter.codeToTokens(code, { lang: key, theme: CODE_THEME })
      .tokens as CodeToken[][];
  } catch {
    return null;
  }
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [tokens, setTokens] = useState<CodeToken[][] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTokens(null);
    if (lang) {
      void highlightCode(code, lang).then((result) => {
        if (!cancelled) setTokens(result);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  if (!tokens) {
    return (
      <pre className="overflow-x-auto rounded-md border border-white/10 bg-white/5 p-3 text-12 leading-relaxed">
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-md border border-white/10 bg-white/5 p-3 text-12 leading-relaxed">
      <code>
        {tokens.map((line, lineIndex) => {
          let offset = 0;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: token stream is stable across renders
            <div key={lineIndex}>
              {line.map((tok) => {
                const tokenKey = offset;
                offset += tok.content.length + 1;
                return (
                  <span
                    key={tokenKey}
                    style={tok.color ? { color: tok.color } : undefined}
                  >
                    {tok.content}
                  </span>
                );
              })}
            </div>
          );
        })}
      </code>
    </pre>
  );
}

// ── Frontmatter "Properties" block ──────────────────────────────────────────

type FrontmatterValue = string | string[];

function parseFrontmatter(
  raw: string,
): { key: string; value: FrontmatterValue }[] {
  const lines = raw.split("\n");
  const entries: { key: string; value: FrontmatterValue }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const kv = /^([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (!kv) {
      entries.push({ key: "", value: line });
      continue;
    }
    const [, rawKey, rest] = kv;
    const key = rawKey.trim();
    if (rest.trim() === "") {
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(lines[j].replace(/^\s*-\s+/, "").trim());
        j++;
      }
      if (items.length) {
        entries.push({ key, value: items });
        i = j - 1;
        continue;
      }
      entries.push({ key, value: "" });
      continue;
    }
    const bracket = /^\[(.*)\]$/.exec(rest.trim());
    if (bracket) {
      const items = bracket[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      entries.push({ key, value: items });
      continue;
    }
    entries.push({ key, value: rest.trim().replace(/^["']|["']$/g, "") });
  }
  return entries;
}

function FrontmatterTable({ raw }: { raw: string }) {
  const entries = useMemo(() => parseFrontmatter(raw), [raw]);
  if (!entries.length) return null;
  return (
    <div className="not-prose mb-4 rounded-md border border-white/10 bg-white/5 p-3 text-13">
      <div className="mb-1.5 text-11 font-medium uppercase tracking-wide text-white/40">
        Properties
      </div>
      <dl className="space-y-1">
        {entries.map((entry, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: frontmatter lines never reorder
          <div key={i} className="flex gap-2">
            <dt className="shrink-0 text-white/50">{entry.key || " "}</dt>
            <dd className="min-w-0 flex-1 text-white/80">
              {Array.isArray(entry.value) ? (
                <span className="flex flex-wrap gap-1">
                  {entry.value.map((v) => (
                    <span
                      key={v}
                      className="rounded bg-white/10 px-1.5 py-0.5 text-11"
                    >
                      {v}
                    </span>
                  ))}
                </span>
              ) : (
                entry.value || <span className="text-white/30">—</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Embeds ───────────────────────────────────────────────────────────────────

interface NoteEmbedProps {
  target: string;
  files: readonly string[];
  root: string;
  onOpenLink: NoteReaderProps["onOpenLink"];
  readNote: NonNullable<NoteReaderProps["readNote"]>;
}

function EmbedFallback({
  target,
  onOpenLink,
}: {
  target: string;
  onOpenLink: NoteReaderProps["onOpenLink"];
}) {
  return (
    <button
      type="button"
      className="not-prose my-2 block rounded-md border border-white/10 bg-white/5 px-3 py-2 text-left text-13 text-primary/80 hover:bg-white/10"
      onClick={(e) => onOpenLink(target, { newTab: e.metaKey || e.ctrlKey })}
    >
      {basenameOf(target)}
    </button>
  );
}

function NoteEmbed({
  target,
  files,
  root,
  onOpenLink,
  readNote,
}: NoteEmbedProps) {
  const [state, setState] = useState<{ content: string } | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    setState(undefined);
    readNote(target)
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [target, readNote]);

  if (state === undefined) {
    return (
      <div className="not-prose my-2 h-16 animate-pulse rounded-md bg-white/5" />
    );
  }
  if (state === null) {
    return <EmbedFallback target={target} onOpenLink={onOpenLink} />;
  }
  return (
    <div className="not-prose my-2 rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-1.5 truncate text-11 font-medium text-white/40">
        {basenameOf(target)}
      </div>
      <NoteReaderView
        content={state.content}
        fromRel={target}
        files={files}
        root={root}
        onOpenLink={onOpenLink}
        className={MARKDOWN_PROSE_CLASS}
        depth={1}
      />
    </div>
  );
}

// ── react-markdown component overrides ──────────────────────────────────────

interface MinimalHastElement {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children?: unknown[];
}

function isHastElement(node: unknown): node is MinimalHastElement {
  return (
    !!node &&
    typeof node === "object" &&
    (node as { type?: unknown }).type === "element"
  );
}

function hastText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; value?: string; children?: unknown[] };
  if (n.type === "text") return n.value ?? "";
  if (Array.isArray(n.children)) return n.children.map(hastText).join("");
  return "";
}

function fenceLang(codeNode: MinimalHastElement): string | undefined {
  const raw = codeNode.properties?.className;
  const classes = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? [raw]
      : [];
  const found = classes.find(
    (c): c is string => typeof c === "string" && c.startsWith("language-"),
  );
  return found?.slice("language-".length);
}

// A tight task-list `<li>` gets the checkbox as its own first child; a loose
// one (blank line between items) wraps it in a `<p>` instead — either way,
// this line number (set on the `<li>` by remarkObsidian, from the mdast
// listItem's position) rides down via context to whichever `input` renders.
const TaskLineContext = createContext<number | null>(null);
const OnToggleTaskContext =
  createContext<NoteReaderProps["onToggleTask"]>(undefined);

// A named top-level component (rather than a closure built inside the
// `components` useMemo) so the `useContext` calls below are unambiguously
// "top level of a component" for both React and static analysis.
function TaskCheckboxInput({
  type,
  checked,
  ...rest
}: ComponentProps<"input">) {
  const line = useContext(TaskLineContext);
  const onToggleTask = useContext(OnToggleTaskContext);
  if (type !== "checkbox" || line === null) {
    return <input type={type} checked={checked} {...rest} />;
  }
  return (
    <input
      type="checkbox"
      checked={checked === true}
      onChange={(e) => onToggleTask?.(line, e.target.checked)}
      className="mr-1.5 accent-primary"
    />
  );
}

interface NoteReaderViewProps extends NoteReaderProps {
  depth: number;
}

function NoteReaderView({
  content,
  fromRel,
  files,
  root,
  onOpenLink,
  onToggleTask,
  readNote,
  className,
  depth,
}: NoteReaderViewProps) {
  const remarkPlugins = useMemo<
    NonNullable<Parameters<typeof ReactMarkdown>[0]["remarkPlugins"]>
  >(
    () => [
      remarkFrontmatter,
      remarkGfm,
      [remarkObsidian, { files, fromRel, root }],
    ],
    [files, fromRel, root],
  );

  const components = useMemo<Components>(() => {
    const a: Components["a"] = ({ node, children, href }) => {
      const props = node?.properties ?? {};
      const wikilink = props["data-wikilink"];
      if (typeof wikilink === "string") {
        const unresolved = props["data-resolved"] === "false";
        return (
          <button
            type="button"
            className={`inline border-0 bg-transparent p-0 font-inherit ${
              unresolved
                ? "text-primary/50 italic no-underline"
                : "text-primary underline-offset-2 hover:underline"
            }`}
            onClick={(e) =>
              onOpenLink(wikilink, { newTab: e.metaKey || e.ctrlKey })
            }
          >
            {children}
          </button>
        );
      }
      const tag = props["data-tag"];
      if (typeof tag === "string") {
        return (
          <button
            type="button"
            className="not-prose inline-block rounded-full border-0 bg-primary/10 px-2 py-0.5 text-11 text-primary no-underline hover:bg-primary/20"
            onClick={(e) =>
              onOpenLink(`#${tag}`, { newTab: e.metaKey || e.ctrlKey })
            }
          >
            #{tag}
          </button>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (window.electron?.shell && href) {
              e.preventDefault();
              void window.electron.shell.openExternal(href);
            }
          }}
        >
          {children}
        </a>
      );
    };

    const div: Components["div"] = ({
      node,
      children,
      className: divClassName,
      ...rest
    }) => {
      const embedTarget = node?.properties?.["data-embed"];
      if (typeof embedTarget === "string") {
        if (depth === 0 && readNote) {
          return (
            <NoteEmbed
              target={embedTarget}
              files={files}
              root={root}
              onOpenLink={onOpenLink}
              readNote={readNote}
            />
          );
        }
        return <EmbedFallback target={embedTarget} onOpenLink={onOpenLink} />;
      }
      const frontmatter = node?.properties?.["data-frontmatter"];
      if (typeof frontmatter === "string") {
        return <FrontmatterTable raw={frontmatter} />;
      }
      return (
        <div className={divClassName} {...rest}>
          {children}
        </div>
      );
    };

    const blockquote: Components["blockquote"] = ({ node, children }) => {
      const type = node?.properties?.["data-callout"];
      if (typeof type === "string") {
        const title = node?.properties?.["data-callout-title"];
        const style = calloutStyle(type);
        const Icon = style.icon;
        return (
          <div
            className={`not-prose my-3 rounded-md border px-3 py-2 ${style.className}`}
          >
            <div className="flex items-center gap-1.5 text-13 font-medium">
              <Icon className="size-3.5 shrink-0" />
              {typeof title === "string" ? title : type}
            </div>
            <div className="mt-1 text-13 [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
              {children}
            </div>
          </div>
        );
      }
      return <blockquote>{children}</blockquote>;
    };

    const li: Components["li"] = ({
      node,
      children,
      className: liClassName,
      ...rest
    }) => {
      const rawLine = node?.properties?.["data-task-line"];
      const line = typeof rawLine === "string" ? Number(rawLine) : null;
      if (line === null) {
        return (
          <li className={liClassName} {...rest}>
            {children}
          </li>
        );
      }
      return (
        <li className={`${liClassName ?? ""} list-none`.trim()} {...rest}>
          <TaskLineContext.Provider value={line}>
            {children}
          </TaskLineContext.Provider>
        </li>
      );
    };

    const code: Components["code"] = ({
      className: codeClassName,
      children,
    }) => <code className={codeClassName}>{children}</code>;

    const pre: Components["pre"] = ({ node }) => {
      const codeNode = node?.children?.[0];
      if (!isHastElement(codeNode) || codeNode.tagName !== "code") return null;
      return (
        <CodeBlock
          code={hastText(codeNode).replace(/\n$/, "")}
          lang={fenceLang(codeNode)}
        />
      );
    };

    const img: Components["img"] = ({ src, alt }) =>
      src ? <MarkdownImage src={src} alt={alt ?? ""} /> : null;

    const mark: Components["mark"] = ({ children }) => (
      <mark className="rounded bg-yellow-400/30 px-0.5 text-inherit">
        {children}
      </mark>
    );

    return {
      a,
      div,
      blockquote,
      li,
      input: TaskCheckboxInput,
      code,
      pre,
      img,
      mark,
    };
  }, [depth, files, root, onOpenLink, readNote]);

  return (
    <div className={className ?? `${MARKDOWN_PROSE_CLASS} p-4`}>
      <OnToggleTaskContext.Provider value={onToggleTask}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          components={components}
          urlTransform={urlTransform}
        >
          {content}
        </ReactMarkdown>
      </OnToggleTaskContext.Provider>
    </div>
  );
}

export function NoteReader(props: NoteReaderProps) {
  return <NoteReaderView {...props} depth={0} />;
}

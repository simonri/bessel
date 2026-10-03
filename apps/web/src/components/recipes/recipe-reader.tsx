import type { RecipeType } from "@bessel/client";
import { Lightbulb } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { describeRecipe } from "./recipe-meta";
import { RECIPE_TYPE_META, typeGradient, typeTint } from "./recipe-style";

const OrderedContext = createContext(false);

// Ingredients (bulleted) can be ticked off while cooking; it's only a
// cooking aid, so nothing is saved.
function ListItem({ children }: { children?: ReactNode }) {
  const ordered = useContext(OrderedContext);
  const [checked, setChecked] = useState(false);
  if (ordered) {
    return (
      <li className="relative pl-9 [counter-increment:step] before:absolute before:top-0 before:left-0 before:flex before:size-6 before:items-center before:justify-center before:rounded-full before:bg-primary-500/15 before:text-11 before:font-semibold before:text-primary-300 before:content-[counter(step)]">
        {children}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => setChecked((c) => !c)}
        className="group flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/[0.04]"
      >
        <span
          aria-hidden
          className={cn(
            "mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-200",
            checked
              ? "bg-primary-500 shadow-[0_0_0_1.5px_var(--color-primary-500)]"
              : "shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.25)] group-hover:shadow-[inset_0_0_0_1.5px_var(--color-primary-400)]",
          )}
        >
          {checked && (
            <svg viewBox="0 0 16 16" className="size-2.5 text-white">
              <path
                d="M3.5 8.5l3 3 6-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <span
          className={cn(
            "transition-colors duration-200",
            checked && "text-white/35 line-through decoration-white/30",
          )}
        >
          {children}
        </span>
      </button>
    </li>
  );
}

const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h2 className="mt-6 mb-2 text-base font-semibold text-white/90">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3 className="mt-6 mb-2 flex items-center gap-2 text-11 font-semibold tracking-wide text-white/50 uppercase first:mt-0">
      <span aria-hidden className="size-1.5 rounded-full bg-primary-400" />
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-4 mb-1.5 text-13 font-semibold text-white/80">
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <OrderedContext.Provider value={false}>
      <ul className="my-1 flex flex-col">{children}</ul>
    </OrderedContext.Provider>
  ),
  ol: ({ children }) => (
    <OrderedContext.Provider value={true}>
      <ol className="my-2 flex flex-col gap-3 [counter-reset:step]">
        {children}
      </ol>
    </OrderedContext.Provider>
  ),
  li: ListItem,
  blockquote: ({ children }) => (
    <aside className="my-4 flex gap-2.5 rounded-xl bg-primary-500/10 px-3.5 py-2.5 text-primary-200/90 ring-1 ring-primary-400/15 [&_p]:my-0">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary-300" />
      <div className="min-w-0">{children}</div>
    </aside>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary-300 underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white/90">{children}</strong>
  ),
  hr: () => <hr className="my-5 border-white/[0.07]" />,
  code: ({ children }) => (
    <code className="rounded bg-white/[0.06] px-1 py-px text-primary-300">
      {children}
    </code>
  ),
};

/** A recipe laid out for cooking from: a soft header, tickable
 *  ingredients, numbered steps and highlighted tips. */
export function RecipeReader({
  title,
  type,
  content,
}: {
  title: string;
  type: RecipeType;
  content: string;
}) {
  const meta = RECIPE_TYPE_META[type];
  const summary = describeRecipe(content);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-5">
      <div
        className="flex items-center gap-4 rounded-2xl px-4 py-4 ring-1 ring-white/[0.06]"
        style={typeGradient(type)}
      >
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-3xl"
        >
          {meta.emoji}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="truncate text-lg font-semibold tracking-tight text-white/95">
            {title || "Untitled"}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex h-5 items-center rounded-full px-2 text-11 font-medium"
              style={typeTint(type)}
            >
              {meta.label}
            </span>
            {summary && (
              <span className="text-11 text-white/50">{summary}</span>
            )}
          </div>
        </div>
      </div>
      <div className="text-13 text-white/75">
        {content.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
            {content}
          </ReactMarkdown>
        ) : (
          <p className="py-6 text-center text-xs text-white/40">
            Nothing written yet - switch to Edit to add ingredients and steps.
          </p>
        )}
      </div>
    </div>
  );
}

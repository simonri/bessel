import type {
  RecipeBody,
  RecipeCallout,
  RecipeIngredient,
  RecipeStep,
  RecipeType,
} from "@bessel/client";
import { AlertTriangle, Clock, Flame, Lightbulb, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { describeRecipe, formatAmount, formatMinutes } from "./recipe-meta";
import { RECIPE_TYPE_META, typeGradient, typeTint } from "./recipe-style";

const PROSE: Components = {
  p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-1.5 list-disc space-y-1 pl-5 marker:text-white/30">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-1 pl-5 marker:text-white/40">
      {children}
    </ol>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white/90">{children}</strong>
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
  code: ({ children }) => (
    <code className="rounded bg-white/[0.06] px-1 py-px text-primary-300">
      {children}
    </code>
  ),
};

/** Light markdown for free text: bold, italics, lists, links. */
function Prose({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn("[&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={PROSE}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-13 font-semibold text-white/80">
      <span aria-hidden className="size-1.5 rounded-full bg-primary-400" />
      {children}
    </h3>
  );
}

function MetaChip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-white/[0.06] px-2 text-11 text-white/60">
      <Icon className="size-3" />
      {children}
    </span>
  );
}

// Ingredients can be ticked off while cooking; it's only a cooking aid, so
// nothing is saved.
function IngredientRow({
  item,
  checked,
  onToggle,
}: {
  item: RecipeIngredient;
  checked: boolean;
  onToggle: () => void;
}) {
  const quantity = [
    item.amount != null ? formatAmount(item.amount) : null,
    item.unit,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li>
      <button
        type="button"
        aria-pressed={checked}
        onClick={onToggle}
        className="group flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/[0.04]"
      >
        <span
          aria-hidden
          className={cn(
            "mt-px flex size-4 shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-200",
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
            "flex min-w-0 flex-1 gap-2 leading-snug transition-colors duration-200",
            checked && "text-white/35 line-through decoration-white/30",
          )}
        >
          {/* A fixed column, so every name starts on the same line. */}
          <span
            className={cn(
              "w-16 shrink-0 font-medium tabular-nums",
              checked ? "text-white/35" : "text-white/90",
            )}
          >
            {quantity}
          </span>
          <span className="min-w-0">
            {item.name}
            {item.note && (
              <span className={cn(checked ? "text-white/25" : "text-white/45")}>
                , {item.note}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function Callout({ callout }: { callout: RecipeCallout }) {
  const warning = callout.kind === "warning";
  const Icon = warning ? AlertTriangle : Lightbulb;
  return (
    <aside
      className={cn(
        "flex gap-2.5 rounded-xl px-3.5 py-2.5 ring-1",
        warning
          ? "bg-amber-400/10 text-amber-100/90 ring-amber-300/15"
          : "bg-primary-500/10 text-primary-200/90 ring-primary-400/15",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          warning ? "text-amber-300" : "text-primary-300",
        )}
      />
      <div className="min-w-0 leading-relaxed">
        {callout.label && (
          <span className="font-semibold">{callout.label}: </span>
        )}
        <Prose text={callout.text} className="inline [&>p]:inline" />
      </div>
    </aside>
  );
}

function Step({ step, number }: { step: RecipeStep; number: number }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-11 font-semibold text-primary-300">
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        {(step.title || step.time_label) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {step.title && (
              <span className="font-medium text-white/90">{step.title}</span>
            )}
            {step.time_label && (
              <MetaChip icon={Clock}>{step.time_label}</MetaChip>
            )}
          </div>
        )}
        {step.text && <Prose text={step.text} />}
        {(step.callouts ?? []).map((callout, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: callouts have no ids and never reorder while reading
          <Callout key={i} callout={callout} />
        ))}
      </div>
    </li>
  );
}

function isEmpty(body: RecipeBody): boolean {
  return (
    !body.intro &&
    !(body.ingredient_groups ?? []).some((g) => (g.items ?? []).length) &&
    !(body.steps ?? []).length &&
    !(body.sections ?? []).length
  );
}

/** A recipe laid out for cooking from: a soft header, tickable
 *  ingredients, numbered steps, tips and extra notes. */
export function RecipeReader({
  title,
  type,
  body,
}: {
  title: string;
  type: RecipeType;
  body: RecipeBody;
}) {
  const meta = RECIPE_TYPE_META[type];
  const summary = describeRecipe(body);
  const groups = (body.ingredient_groups ?? []).filter(
    (g) => (g.items ?? []).length,
  );
  const steps = body.steps ?? [];
  const sections = body.sections ?? [];
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  const toggle = (key: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-5 text-13 text-white/75">
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
            {body.yield_text && (
              <MetaChip icon={Users}>{body.yield_text}</MetaChip>
            )}
            {body.total_minutes ? (
              <MetaChip icon={Clock}>
                {formatMinutes(body.total_minutes)}
              </MetaChip>
            ) : null}
            {body.active_minutes ? (
              <MetaChip icon={Flame}>
                {formatMinutes(body.active_minutes)} active
              </MetaChip>
            ) : null}
            {!body.yield_text && !body.total_minutes && summary && (
              <span className="text-11 text-white/50">{summary}</span>
            )}
          </div>
        </div>
      </div>

      {isEmpty(body) ? (
        <p className="py-6 text-center text-xs text-white/40">
          Nothing written yet - switch to Edit to add ingredients and steps.
        </p>
      ) : (
        <>
          {body.intro && <Prose text={body.intro} className="text-white/70" />}

          {groups.length > 0 && (
            <section>
              <SectionHeading>Ingredients</SectionHeading>
              <div className="flex flex-col gap-3">
                {groups.map((group, g) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: groups have no ids; order is the content
                  <div key={g}>
                    {group.title && (
                      <h4 className="mb-1 px-1.5 text-xs font-semibold text-white/70">
                        {group.title}
                      </h4>
                    )}
                    <ul className="flex flex-col">
                      {(group.items ?? []).map((item, i) => {
                        const key = `${g}-${i}`;
                        return (
                          <IngredientRow
                            key={key}
                            item={item}
                            checked={ticked.has(key)}
                            onToggle={() => toggle(key)}
                          />
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {steps.length > 0 && (
            <section>
              <SectionHeading>Steps</SectionHeading>
              <ol className="flex flex-col gap-4">
                {steps.map((step, i) => (
                  <Step
                    // biome-ignore lint/suspicious/noArrayIndexKey: steps have no ids; order is the content
                    key={i}
                    step={step}
                    number={i + 1}
                  />
                ))}
              </ol>
            </section>
          )}

          {sections.map((section, i) => (
            <section
              // biome-ignore lint/suspicious/noArrayIndexKey: sections have no ids; order is the content
              key={i}
              className="rounded-2xl bg-white/[0.03] px-4 py-3.5 ring-1 ring-white/[0.06]"
            >
              <h3 className="mb-1.5 text-13 font-semibold text-white/85">
                {section.title}
              </h3>
              <Prose text={section.text ?? ""} />
            </section>
          ))}
        </>
      )}
    </div>
  );
}

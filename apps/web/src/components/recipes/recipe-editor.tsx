import type {
  RecipeBody,
  RecipeCallout,
  RecipeIngredient,
  RecipeIngredientGroup,
  RecipeSection,
  RecipeStep,
} from "@bessel/client";
import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Lightbulb,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  formatAmount,
  parseAmount,
  parseIngredientLines,
} from "@/lib/recipe-ingredient-parse";
import { cn } from "@/lib/utils";

// --- body helpers --------------------------------------------------------------

const emptyIngredient = (): RecipeIngredient => ({
  amount: null,
  unit: null,
  name: "",
  note: null,
});

const emptyStep = (): RecipeStep => ({
  title: null,
  text: "",
  time_label: null,
  callouts: [],
});

/** What a brand-new recipe starts from: one ingredient row, one step. */
export function emptyRecipeBody(): RecipeBody {
  return {
    intro: null,
    yield_text: null,
    total_minutes: null,
    active_minutes: null,
    ingredient_groups: [{ title: null, items: [emptyIngredient()] }],
    steps: [emptyStep()],
    sections: [],
  };
}

const trimmed = (value: string | null | undefined): string | null =>
  value?.trim() || null;

const positiveMinutes = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) && value >= 1
    ? Math.round(value)
    : null;

/**
 * The body as it should be saved: blank rows, steps, tips and sections the
 * editor keeps around for typing into are dropped (the API rejects an
 * ingredient without a name), and text is trimmed.
 */
export function cleanRecipeBody(body: RecipeBody): RecipeBody {
  const ingredient_groups = (body.ingredient_groups ?? [])
    .map((group) => ({
      title: trimmed(group.title),
      items: (group.items ?? [])
        .map((item) => ({
          amount: item.amount ?? null,
          unit: trimmed(item.unit),
          name: item.name.trim(),
          note: trimmed(item.note),
        }))
        .filter((item) => item.name),
    }))
    .filter((group) => group.items.length > 0);

  const steps = (body.steps ?? [])
    .map((step) => ({
      title: trimmed(step.title),
      text: step.text?.trim() ?? "",
      time_label: trimmed(step.time_label),
      callouts: (step.callouts ?? [])
        .map((c) => ({
          kind: c.kind ?? "tip",
          label: trimmed(c.label),
          text: c.text.trim(),
        }))
        .filter((c) => c.text),
    }))
    .filter((step) => step.title || step.text);

  const sections = (body.sections ?? [])
    .map((s) => ({ title: s.title.trim(), text: s.text?.trim() ?? "" }))
    .filter((s) => s.title || s.text)
    .map((s) => ({ ...s, title: s.title || "Notes" }));

  return {
    intro: trimmed(body.intro),
    yield_text: trimmed(body.yield_text),
    total_minutes: positiveMinutes(body.total_minutes),
    active_minutes: positiveMinutes(body.active_minutes),
    ingredient_groups,
    steps,
    sections,
  };
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function replaceAt<T>(list: T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}

// --- small controls ------------------------------------------------------------

const CARD = "rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]";
const FIELD =
  "h-8 min-w-0 rounded-lg bg-white/[0.04] px-2.5 text-13 text-white/90 outline-none ring-1 ring-white/[0.06] transition-[background-color,box-shadow] duration-150 placeholder:text-white/25 hover:bg-white/[0.06] focus:bg-white/[0.06] focus:ring-primary-400/40";
const GHOST_FIELD =
  "h-8 min-w-0 rounded-lg bg-transparent px-2 text-13 text-white/90 outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-white/25 hover:bg-white/[0.04] focus:bg-white/[0.06] focus:ring-1 focus:ring-primary-400/40";
const ICON_BUTTON =
  "flex size-6 shrink-0 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-white/[0.08] hover:text-white/80 focus-visible:bg-white/[0.08] focus-visible:text-white/80 outline-none disabled:pointer-events-none disabled:opacity-30";
const ADD_BUTTON =
  "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-white/50 transition-colors hover:bg-primary-500/10 hover:text-primary-300 focus-visible:bg-primary-500/10 focus-visible:text-primary-300 outline-none";

function AutoTextarea({
  value,
  onChange,
  className,
  minRows = 2,
  ...props
}: Omit<React.ComponentProps<"textarea">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Re-measure whenever the text changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full resize-none rounded-lg bg-white/[0.04] px-2.5 py-2 text-13 leading-relaxed text-white/90 outline-none ring-1 ring-white/[0.06] transition-[background-color,box-shadow] duration-150 placeholder:text-white/25 hover:bg-white/[0.06] focus:bg-white/[0.06] focus:ring-primary-400/40",
        className,
      )}
      {...props}
    />
  );
}

function MinutesInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <div className="relative flex items-center">
      <input
        type="number"
        min={1}
        inputMode="numeric"
        aria-label={label}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          onChange(Number.isFinite(n) && n > 0 ? Math.round(n) : null);
        }}
        className={cn(FIELD, "w-full pr-10 [appearance:textfield]")}
      />
      <span className="pointer-events-none absolute right-2.5 text-11 text-white/35">
        min
      </span>
    </div>
  );
}

/** Shows "1½"; while typing accepts "1½", "1.5", "1,5" or "½". */
function AmountInput({
  value,
  onChange,
  label,
  onKeyDown,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  label: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value != null ? formatAmount(value) : "");
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      placeholder="1½"
      value={shown}
      onFocus={() => setDraft(shown)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) onChange(parseAmount(draft));
        setDraft(null);
      }}
      onKeyDown={onKeyDown}
      className={cn(GHOST_FIELD, "w-14 text-right tabular-nums")}
    />
  );
}

function SectionHeading({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 px-1">
      <div>
        <h3 className="text-xs font-semibold text-white/70">{title}</h3>
        {hint && <p className="mt-0.5 text-11 text-white/35">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function MoveButtons({
  index,
  count,
  label,
  onMove,
}: {
  index: number;
  count: number;
  label: string;
  onMove: (to: number) => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        className={ICON_BUTTON}
      >
        <ChevronUp className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        className={ICON_BUTTON}
      >
        <ChevronDown className="size-3.5" />
      </button>
    </>
  );
}

// --- ingredients ----------------------------------------------------------------

function IngredientGroupCard({
  group,
  groupIndex,
  groupCount,
  onChange,
  onRemove,
  onMove,
  registerName,
  requestFocus,
}: {
  group: RecipeIngredientGroup;
  groupIndex: number;
  groupCount: number;
  onChange: (group: RecipeIngredientGroup) => void;
  onRemove: () => void;
  onMove: (to: number) => void;
  registerName: (row: number, el: HTMLInputElement | null) => void;
  requestFocus: (row: number) => void;
}) {
  const items = group.items ?? [];
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const setItems = (next: RecipeIngredient[]) =>
    onChange({ ...group, items: next });
  const setItem = (row: number, patch: Partial<RecipeIngredient>) =>
    setItems(replaceAt(items, row, { ...items[row], ...patch }));

  const insertAfter = (row: number, added: RecipeIngredient[]) => {
    const next = [...items];
    // Pasting into an empty row replaces it rather than leaving it behind.
    const replace = row >= 0 && !items[row]?.name.trim() ? 1 : 0;
    next.splice(row + 1 - replace, replace, ...added);
    setItems(next);
    requestFocus(row + added.length - replace);
  };

  const addRow = () => {
    setItems([...items, emptyIngredient()]);
    requestFocus(items.length);
  };

  const isBlank = (item: RecipeIngredient) =>
    !item.name && item.amount == null && !item.unit && !item.note;

  return (
    <div className={cn(CARD, "flex flex-col gap-1 p-2")}>
      <div className="flex items-center gap-1">
        <input
          aria-label={`Ingredient group ${groupIndex + 1} name`}
          placeholder="Group name (optional)"
          value={group.title ?? ""}
          onChange={(e) => onChange({ ...group, title: e.target.value })}
          className={cn(
            GHOST_FIELD,
            "flex-1 font-medium text-white/80 placeholder:font-normal",
          )}
        />
        {groupCount > 1 && (
          <MoveButtons
            index={groupIndex}
            count={groupCount}
            label="group"
            onMove={onMove}
          />
        )}
        {groupCount > 1 && (
          <button
            type="button"
            aria-label={`Remove group ${group.title || groupIndex + 1}`}
            onClick={onRemove}
            className={ICON_BUTTON}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col">
          {items.map((item, row) => {
            const label = item.name || `ingredient ${row + 1}`;
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own
                key={row}
                className="group/row flex items-center gap-1 rounded-lg focus-within:bg-white/[0.02] hover:bg-white/[0.02]"
              >
                <AmountInput
                  label={`Amount for ${label}`}
                  value={item.amount}
                  onChange={(amount) => setItem(row, { amount })}
                />
                <input
                  aria-label={`Unit for ${label}`}
                  placeholder="dl"
                  value={item.unit ?? ""}
                  onChange={(e) => setItem(row, { unit: e.target.value })}
                  className={cn(GHOST_FIELD, "w-16")}
                />
                <input
                  ref={(el) => registerName(row, el)}
                  aria-label={`Ingredient ${row + 1}`}
                  placeholder="Ingredient"
                  value={item.name}
                  onChange={(e) => setItem(row, { name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      insertAfter(row, [emptyIngredient()]);
                    } else if (
                      e.key === "Backspace" &&
                      isBlank(item) &&
                      items.length > 1
                    ) {
                      e.preventDefault();
                      setItems(items.filter((_, i) => i !== row));
                      requestFocus(Math.max(0, row - 1));
                    }
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (!text.includes("\n")) return;
                    e.preventDefault();
                    const pasted = parseIngredientLines(text);
                    if (pasted.length) insertAfter(row, pasted);
                  }}
                  className={cn(GHOST_FIELD, "flex-[2]")}
                />
                <input
                  aria-label={`Note for ${label}`}
                  placeholder="note"
                  value={item.note ?? ""}
                  onChange={(e) => setItem(row, { note: e.target.value })}
                  className={cn(GHOST_FIELD, "flex-1 text-white/55")}
                />
                <div className="flex opacity-0 transition-opacity duration-150 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
                  <MoveButtons
                    index={row}
                    count={items.length}
                    label={label}
                    onMove={(to) => setItems(moveItem(items, row, to))}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    onClick={() => setItems(items.filter((_, i) => i !== row))}
                    className={ICON_BUTTON}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pasting ? (
        <div className="flex flex-col gap-1.5 p-1">
          <AutoTextarea
            aria-label="Paste ingredients, one per line"
            placeholder={
              "5 dl havregryn\n2 msk honung (eller lönnsirap)\n1 krm salt"
            }
            value={pasteText}
            onChange={setPasteText}
            minRows={3}
            autoFocus
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setPasting(false);
                setPasteText("");
              }}
              className={ADD_BUTTON}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!pasteText.trim()}
              onClick={() => {
                const pasted = parseIngredientLines(pasteText);
                const kept = items.filter((item) => !isBlank(item));
                setItems([...kept, ...pasted]);
                setPasting(false);
                setPasteText("");
              }}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary-500 px-3 text-xs font-medium text-white transition-colors hover:bg-primary-400 disabled:opacity-40"
            >
              Add ingredients
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button type="button" onClick={addRow} className={ADD_BUTTON}>
            <Plus className="size-3.5" />
            Add ingredient
          </button>
          <button
            type="button"
            onClick={() => setPasting(true)}
            className={ADD_BUTTON}
          >
            <ClipboardPaste className="size-3.5" />
            Paste a list
          </button>
        </div>
      )}
    </div>
  );
}

function IngredientsEditor({
  groups,
  onChange,
}: {
  groups: RecipeIngredientGroup[];
  onChange: (groups: RecipeIngredientGroup[]) => void;
}) {
  // Name inputs by "group:row", so keyboard actions can move focus to the
  // row they just created or to the one before a removed row.
  const nameInputs = useRef(new Map<string, HTMLInputElement>());
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFocus) return;
    nameInputs.current.get(pendingFocus)?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading
        title="Ingredients"
        hint="Enter adds a row. Paste a whole list and it splits into rows."
      >
        <button
          type="button"
          onClick={() =>
            onChange([...groups, { title: null, items: [emptyIngredient()] }])
          }
          className={ADD_BUTTON}
        >
          <Plus className="size-3.5" />
          Add group
        </button>
      </SectionHeading>
      {groups.length === 0 ? (
        <p className={cn(CARD, "px-3 py-4 text-center text-xs text-white/40")}>
          No ingredients yet - add a group to start your list.
        </p>
      ) : (
        groups.map((group, g) => (
          <IngredientGroupCard
            // biome-ignore lint/suspicious/noArrayIndexKey: groups have no identity of their own
            key={g}
            group={group}
            groupIndex={g}
            groupCount={groups.length}
            onChange={(next) => onChange(replaceAt(groups, g, next))}
            onRemove={() => onChange(groups.filter((_, i) => i !== g))}
            onMove={(to) => onChange(moveItem(groups, g, to))}
            registerName={(row, el) => {
              const key = `${g}:${row}`;
              if (el) nameInputs.current.set(key, el);
              else nameInputs.current.delete(key);
            }}
            requestFocus={(row) => setPendingFocus(`${g}:${row}`)}
          />
        ))
      )}
    </section>
  );
}

// --- steps ------------------------------------------------------------------------

function CalloutEditor({
  callout,
  onChange,
  onRemove,
  label,
}: {
  callout: RecipeCallout;
  onChange: (callout: RecipeCallout) => void;
  onRemove: () => void;
  label: string;
}) {
  const warning = callout.kind === "warning";
  const Icon = warning ? TriangleAlert : Lightbulb;
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg p-2 ring-1",
        warning
          ? "bg-amber-400/[0.06] ring-amber-300/15"
          : "bg-primary-500/[0.06] ring-primary-400/15",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            warning ? "text-amber-300" : "text-primary-300",
          )}
        />
        <fieldset className="flex rounded-full bg-white/[0.04] p-0.5">
          <legend className="sr-only">{`${label} kind`}</legend>
          {(["tip", "warning"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={(callout.kind ?? "tip") === kind}
              onClick={() => onChange({ ...callout, kind })}
              className={cn(
                "h-5 rounded-full px-2 text-11 font-medium transition-colors",
                (callout.kind ?? "tip") === kind
                  ? "bg-white/[0.12] text-white/85"
                  : "text-white/40 hover:text-white/70",
              )}
            >
              {kind === "tip" ? "Tip" : "Warning"}
            </button>
          ))}
        </fieldset>
        <input
          aria-label={`${label} label`}
          placeholder={warning ? "Common mistake" : "Pro tip"}
          value={callout.label ?? ""}
          onChange={(e) => onChange({ ...callout, label: e.target.value })}
          className={cn(GHOST_FIELD, "h-6 flex-1 text-xs")}
        />
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className={ICON_BUTTON}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <AutoTextarea
        aria-label={`${label} text`}
        placeholder={
          warning ? "What to watch out for…" : "A little secret that helps…"
        }
        value={callout.text}
        onChange={(text) => onChange({ ...callout, text })}
        minRows={1}
      />
    </div>
  );
}

function StepCard({
  step,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  step: RecipeStep;
  index: number;
  count: number;
  onChange: (step: RecipeStep) => void;
  onRemove: () => void;
  onMove: (to: number) => void;
}) {
  const callouts = step.callouts ?? [];
  const n = index + 1;
  return (
    <li className={cn(CARD, "group/step flex gap-3 p-3")}>
      <span
        aria-hidden
        className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-11 font-semibold text-primary-300 tabular-nums"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-1">
          <input
            aria-label={`Step ${n} title`}
            placeholder="Title (optional)"
            value={step.title ?? ""}
            onChange={(e) => onChange({ ...step, title: e.target.value })}
            className={cn(
              GHOST_FIELD,
              "flex-1 font-medium placeholder:font-normal",
            )}
          />
          <div className="flex opacity-0 transition-opacity duration-150 group-focus-within/step:opacity-100 group-hover/step:opacity-100">
            <MoveButtons
              index={index}
              count={count}
              label={`step ${n}`}
              onMove={onMove}
            />
            <button
              type="button"
              aria-label={`Remove step ${n}`}
              onClick={onRemove}
              className={ICON_BUTTON}
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
        <AutoTextarea
          aria-label={`Step ${n} instructions`}
          placeholder="What to do… Supports **bold** and lists."
          value={step.text ?? ""}
          onChange={(text) => onChange({ ...step, text })}
        />
        <input
          aria-label={`Step ${n} time`}
          placeholder="How long? e.g. 5 min + 30 min chill"
          value={step.time_label ?? ""}
          onChange={(e) => onChange({ ...step, time_label: e.target.value })}
          className={FIELD}
        />
        {callouts.map((callout, c) => (
          <CalloutEditor
            // biome-ignore lint/suspicious/noArrayIndexKey: callouts have no identity of their own
            key={c}
            label={`Step ${n} tip ${c + 1}`}
            callout={callout}
            onChange={(next) =>
              onChange({ ...step, callouts: replaceAt(callouts, c, next) })
            }
            onRemove={() =>
              onChange({
                ...step,
                callouts: callouts.filter((_, i) => i !== c),
              })
            }
          />
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...step,
              callouts: [...callouts, { kind: "tip", label: null, text: "" }],
            })
          }
          className={cn(ADD_BUTTON, "self-start")}
        >
          <Lightbulb className="size-3.5" />
          Add tip
        </button>
      </div>
    </li>
  );
}

// --- editor -------------------------------------------------------------------------

/** Structured recipe editing; fully controlled, saving is up to the parent. */
export function RecipeEditor({
  value,
  onChange,
}: {
  value: RecipeBody;
  onChange: (next: RecipeBody) => void;
}) {
  const groups = value.ingredient_groups ?? [];
  const steps = value.steps ?? [];
  const sections = value.sections ?? [];
  const set = (patch: Partial<RecipeBody>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionHeading title="About" />
        <div className={cn(CARD, "flex flex-col gap-2 p-3")}>
          <AutoTextarea
            aria-label="Intro"
            placeholder="A little about this recipe…"
            value={value.intro ?? ""}
            onChange={(intro) => set({ intro })}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="px-1 text-11 text-white/40">Makes</span>
              <input
                placeholder="e.g. 3 burgers"
                value={value.yield_text ?? ""}
                onChange={(e) => set({ yield_text: e.target.value })}
                className={FIELD}
              />
            </label>
            <div className="flex flex-col gap-1">
              <span aria-hidden className="px-1 text-11 text-white/40">
                Total time
              </span>
              <MinutesInput
                label="Total time in minutes"
                placeholder="60"
                value={value.total_minutes}
                onChange={(total_minutes) => set({ total_minutes })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span aria-hidden className="px-1 text-11 text-white/40">
                Hands-on time
              </span>
              <MinutesInput
                label="Hands-on time in minutes"
                placeholder="15"
                value={value.active_minutes}
                onChange={(active_minutes) => set({ active_minutes })}
              />
            </div>
          </div>
        </div>
      </section>

      <IngredientsEditor
        groups={groups}
        onChange={(ingredient_groups) => set({ ingredient_groups })}
      />

      <section className="flex flex-col gap-2">
        <SectionHeading title="Steps" hint="One card per step, in order." />
        {steps.length === 0 ? (
          <p
            className={cn(CARD, "px-3 py-4 text-center text-xs text-white/40")}
          >
            No steps yet - how does it come together?
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {steps.map((step, s) => (
              <StepCard
                // biome-ignore lint/suspicious/noArrayIndexKey: steps have no identity of their own
                key={s}
                step={step}
                index={s}
                count={steps.length}
                onChange={(next) => set({ steps: replaceAt(steps, s, next) })}
                onRemove={() => set({ steps: steps.filter((_, i) => i !== s) })}
                onMove={(to) => set({ steps: moveItem(steps, s, to) })}
              />
            ))}
          </ol>
        )}
        <button
          type="button"
          onClick={() => set({ steps: [...steps, emptyStep()] })}
          className={cn(ADD_BUTTON, "self-start")}
        >
          <Plus className="size-3.5" />
          Add step
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading
          title="Extra sections"
          hint="Golden rules, variations, serving ideas…"
        />
        {sections.map((section: RecipeSection, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: sections have no identity of their own
            key={i}
            className={cn(CARD, "flex flex-col gap-2 p-3")}
          >
            <div className="flex items-center gap-1">
              <input
                aria-label={`Section ${i + 1} title`}
                placeholder="Section title"
                value={section.title}
                onChange={(e) =>
                  set({
                    sections: replaceAt(sections, i, {
                      ...section,
                      title: e.target.value,
                    }),
                  })
                }
                className={cn(
                  GHOST_FIELD,
                  "flex-1 font-medium placeholder:font-normal",
                )}
              />
              <button
                type="button"
                aria-label={`Remove section ${section.title || i + 1}`}
                onClick={() =>
                  set({ sections: sections.filter((_, j) => j !== i) })
                }
                className={ICON_BUTTON}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <AutoTextarea
              aria-label={`Section ${i + 1} text`}
              placeholder="Supports **bold** and lists."
              value={section.text ?? ""}
              onChange={(text) =>
                set({ sections: replaceAt(sections, i, { ...section, text }) })
              }
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            set({ sections: [...sections, { title: "", text: "" }] })
          }
          className={cn(ADD_BUTTON, "self-start")}
        >
          <Plus className="size-3.5" />
          Add section
        </button>
      </section>
    </div>
  );
}

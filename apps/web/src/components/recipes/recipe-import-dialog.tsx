import {
  type RecipeImportResult,
  structureRecipeTextV1RecipesImportPostMutation,
} from "@bessel/client";
import {
  GlassDialog,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogTitle,
} from "@bessel/ui/components/glass-dialog";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";

export const RECIPE_IMPORT_MAX_CHARS = 20_000;

const WORKING_PHRASES = [
  "Reading your recipe…",
  "Finding the ingredients…",
  "Lining up the steps…",
  "Setting the timers…",
];

export const IMPORT_FALLBACK_ERROR =
  "Couldn't reach the recipe helper. Try again in a moment.";

/** Cycles through what the helper is "doing" so a few seconds of waiting feel alive. */
export function useWorkingPhrase(active: boolean): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const id = setInterval(
      () => setIndex((i) => (i + 1) % WORKING_PHRASES.length),
      1800,
    );
    return () => clearInterval(id);
  }, [active]);
  return WORKING_PHRASES[index];
}

/**
 * Paste a recipe from anywhere — a website, notes, a message — and get it back
 * sorted into ingredients and steps. The text survives closing the dialog and
 * failed attempts, so nothing pasted is ever lost.
 */
export function RecipeImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (result: RecipeImportResult) => void;
}) {
  const [text, setText] = useState("");
  const structure = useMutation({
    ...structureRecipeTextV1RecipesImportPostMutation({ client }),
    // Shown inline below the text instead.
    meta: { errorToast: false },
    onSuccess: (result) => {
      setText("");
      onImported(result);
      onOpenChange(false);
    },
  });
  const phrase = useWorkingPhrase(structure.isPending);

  const trimmed = text.trim();
  const tooLong = trimmed.length > RECIPE_IMPORT_MAX_CHARS;
  const canSubmit = trimmed.length > 0 && !tooLong && !structure.isPending;

  const submit = () => {
    if (canSubmit) structure.mutate({ client, body: { text: trimmed } });
  };

  return (
    <GlassDialog
      open={open}
      onOpenChange={(next) => {
        if (!structure.isPending) onOpenChange(next);
      }}
    >
      <GlassDialogContent
        className="flex w-[calc(100vw-2rem)] max-w-lg flex-col gap-4 p-5"
        showCloseButton={!structure.isPending}
      >
        <div className="flex items-start gap-3 pr-8">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-300 ring-1 ring-primary-400/20"
          >
            <Sparkles className="size-4" />
          </span>
          <div className="flex flex-col gap-0.5">
            <GlassDialogTitle>Paste a recipe</GlassDialogTitle>
            <GlassDialogDescription>
              From a website, your notes or a message - it gets sorted into
              ingredients, steps and timers for you.
            </GlassDialogDescription>
          </div>
        </div>

        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (structure.isError) structure.reset();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            readOnly={structure.isPending}
            aria-label="Recipe text"
            placeholder={
              "Pancakes\n\n2½ dl flour\n5 dl milk\n3 eggs\n\nWhisk everything together and let it rest for 10 minutes…"
            }
            // biome-ignore lint/a11y/noAutofocus: the dialog exists to receive a paste
            autoFocus
            className={cn(
              "h-64 w-full resize-none rounded-xl bg-white/[0.04] px-3.5 py-3 text-13 leading-relaxed text-white/85 ring-1 ring-white/[0.08] outline-none transition-[box-shadow,background-color,opacity] duration-200 placeholder:text-white/25 focus:bg-white/[0.06] focus:ring-primary-400/40",
              structure.isPending && "opacity-40",
            )}
          />
          {structure.isPending && (
            <div
              role="status"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <span className="flex items-center gap-2 rounded-full bg-panel/90 px-3.5 py-1.5 text-12 font-medium text-white/80 ring-1 ring-white/10 shadow-lg">
                <Sparkles className="size-3.5 text-primary-300 motion-safe:animate-pulse" />
                {phrase}
              </span>
            </div>
          )}
        </div>

        {structure.isError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl bg-rose-500/[0.08] px-3.5 py-2.5 text-12 ring-1 ring-rose-400/20"
          >
            <CircleAlert className="mt-px size-3.5 shrink-0 text-rose-300" />
            <div className="flex flex-col gap-0.5">
              <span className="text-rose-200">
                {errorDetail(structure.error, IMPORT_FALLBACK_ERROR)}
              </span>
              <span className="text-white/40">
                Your text is still here - tweak it and try again.
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              "text-11",
              tooLong ? "text-rose-300" : "text-white/30",
            )}
          >
            {tooLong
              ? "That's a lot - paste just the recipe part"
              : "Ctrl/⌘ + Enter to sort it"}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={structure.isPending}
              className="flex h-8 items-center rounded-full px-3.5 text-xs font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/85 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="flex h-8 items-center gap-1.5 rounded-full bg-primary-500 px-4 text-xs font-medium text-white transition-[background-color,opacity,transform] duration-150 hover:bg-primary-400 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
            >
              {structure.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {structure.isPending ? "Sorting…" : "Sort it out"}
            </button>
          </div>
        </div>
      </GlassDialogContent>
    </GlassDialog>
  );
}

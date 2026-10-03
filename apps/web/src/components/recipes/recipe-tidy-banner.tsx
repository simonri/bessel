import { Loader2, Sparkles } from "lucide-react";
import { useWorkingPhrase } from "./recipe-import-dialog";

/** Offered on recipes still stored as plain text: one tap sorts them into the structured format. */
export function RecipeTidyBanner({
  pending,
  disabled,
  onTidy,
}: {
  pending: boolean;
  disabled: boolean;
  onTidy: () => void;
}) {
  const phrase = useWorkingPhrase(pending);
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-4">
      <div className="flex items-center gap-3 rounded-2xl bg-primary-500/[0.07] py-2 pr-2 pl-3 ring-1 ring-primary-400/15">
        <Sparkles
          aria-hidden
          className="size-4 shrink-0 text-primary-300 motion-safe:data-[pending=true]:animate-pulse"
          data-pending={pending}
        />
        <p className="min-w-0 flex-1 text-12 text-white/60" role="status">
          {pending ? (
            <span className="text-white/80">{phrase}</span>
          ) : (
            <>
              <span className="text-white/80">Written as plain text.</span> Sort
              it into ingredients, steps and timers?
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onTidy}
          disabled={disabled}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-primary-500 px-3 text-xs font-medium text-white transition-[background-color,opacity,transform] duration-150 hover:bg-primary-400 active:scale-[0.97] disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {pending ? "Tidying…" : "Tidy up"}
        </button>
      </div>
    </div>
  );
}

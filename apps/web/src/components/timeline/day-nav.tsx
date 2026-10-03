import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ARROW =
  "flex size-7 items-center justify-center rounded-full text-white/50 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.08] hover:text-white/90 active:scale-90 disabled:pointer-events-none disabled:opacity-30";

/** ‹ Today › as one soft pill; "Back to today" appears when you've wandered. */
export function DayNav({
  label,
  onPrev,
  onNext,
  nextDisabled,
  onToday,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  onToday?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {onToday && (
        <button
          type="button"
          onClick={onToday}
          className="h-8 rounded-full px-3 text-xs font-medium text-primary-300 transition-colors duration-150 hover:bg-primary-500/10"
        >
          Back to today
        </button>
      )}
      <div className="flex h-8 items-center gap-1 rounded-full bg-white/[0.04] px-0.5 ring-1 ring-white/[0.06]">
        <button
          type="button"
          aria-label="Previous day"
          onClick={onPrev}
          className={ARROW}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span
          className={cn(
            "min-w-28 text-center text-xs font-medium tabular-nums text-white/85",
          )}
        >
          {label}
        </span>
        <button
          type="button"
          aria-label="Next day"
          onClick={onNext}
          disabled={nextDisabled}
          className={ARROW}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";

/** A little encouragement at the top of the Done tab. */
export function DoneSummary({ count }: { count: number }) {
  return (
    <p
      className={cn(
        "rounded-xl px-3 py-2 text-xs",
        count > 0
          ? "bg-primary-500/10 text-primary-300/90"
          : "bg-white/[0.04] text-white/55",
      )}
    >
      {count > 0
        ? `You finished ${count} ${count === 1 ? "thing" : "things"} this week ✨`
        : "Nothing finished this week yet - you've got this."}
    </p>
  );
}

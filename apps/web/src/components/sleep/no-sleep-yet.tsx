import { cn } from "@/lib/utils";

export function NoSleepYet({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 py-10 text-center",
        className,
      )}
    >
      <p className="text-13 font-medium text-white/80">No sleep here yet 🌙</p>
      <p className="max-w-sm text-12 leading-relaxed text-white/45">
        Sleep comes from Apple Health via the Bessel iPhone app, which isn't
        public yet.
      </p>
    </div>
  );
}

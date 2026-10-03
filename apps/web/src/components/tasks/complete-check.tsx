import { cn } from "@/lib/utils";

const SPARKLE_ANGLES = [0, 60, 120, 180, 240, 300];

/**
 * The round check in front of a task. While `checked` it fills with the
 * accent colour, draws a tick and throws a few sparkles — the small reward
 * for finishing something.
 */
export function CompleteCheck({
  checked,
  onToggle,
  label,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "group/check relative flex size-[18px] shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow,transform] duration-200 ease-out active:scale-90",
        checked
          ? "bg-primary-500 shadow-[0_0_0_1.5px_var(--color-primary-500)]"
          : "shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.25)] hover:bg-primary-500/15 hover:shadow-[inset_0_0_0_1.5px_var(--color-primary-400)]",
        className,
      )}
    >
      {checked ? (
        <>
          <svg viewBox="0 0 16 16" className="size-3 text-white" aria-hidden>
            <path
              d="M3.5 8.5l3 3 6-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-check-draw"
            />
          </svg>
          {SPARKLE_ANGLES.map((angle) => (
            <span
              key={angle}
              aria-hidden
              className="animate-sparkle pointer-events-none absolute size-1 rounded-full bg-primary-300"
              style={{ "--angle": `${angle}deg` } as React.CSSProperties}
            />
          ))}
        </>
      ) : (
        <svg
          viewBox="0 0 16 16"
          className="size-3 text-primary-300 opacity-0 transition-opacity duration-150 group-hover/check:opacity-100"
          aria-hidden
        >
          <path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

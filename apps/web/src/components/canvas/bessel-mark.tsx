import { cn } from "@/lib/utils";

/** Bessel's mark: a four-petal flower in the accent colour. */
export function BesselMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn(
        "size-[18px] shrink-0 text-primary-400 transition-transform duration-500 ease-out",
        className,
      )}
    >
      <g fill="currentColor">
        <circle cx="12" cy="6.5" r="5" />
        <circle cx="17.5" cy="12" r="5" />
        <circle cx="12" cy="17.5" r="5" />
        <circle cx="6.5" cy="12" r="5" />
      </g>
      <circle cx="12" cy="12" r="3" className="fill-chrome" />
      <circle cx="12" cy="12" r="1.6" className="fill-primary-300" />
    </svg>
  );
}

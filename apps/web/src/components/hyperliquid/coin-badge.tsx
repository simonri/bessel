import { projectHue } from "@/components/tasks/project-colors";
import { cn } from "@/lib/utils";

export function pastel(hue: number, alpha = 1): string {
  return `oklch(0.8 0.1 ${hue} / ${alpha})`;
}

/** A coin's initial on a soft circle in a colour picked from its name. */
export function CoinBadge({
  coin,
  className,
}: {
  coin: string;
  className?: string;
}) {
  const hue = projectHue(coin);
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        className,
      )}
      style={{ backgroundColor: pastel(hue, 0.16), color: pastel(hue) }}
    >
      {coin.slice(0, 1)}
    </span>
  );
}

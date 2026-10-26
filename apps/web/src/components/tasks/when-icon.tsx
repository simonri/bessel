import { AlertCircle, CalendarClock, CalendarDays, Sun } from "lucide-react";
import type { WhenKey } from "./today-groups";

/** A ring partly filled, like a status that's that far along. */
function ProgressCircle({ fraction }: { fraction: number }) {
  const r = 4;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4">
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={r * 2}
        strokeDasharray={`${c * fraction} ${c}`}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}

function DashedCircle() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4">
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2.6 2.4"
      />
    </svg>
  );
}

/** How each group of the task list looks: a status icon in its colour, and a faint band of the same. */
export const WHEN_STYLE: Record<
  WhenKey,
  { icon: React.ReactNode; color: string; band: string }
> = {
  doing: {
    icon: <ProgressCircle fraction={0.5} />,
    color: "text-amber-400",
    band: "bg-amber-400/[0.07]",
  },
  review: {
    icon: <ProgressCircle fraction={0.75} />,
    color: "text-emerald-400",
    band: "bg-emerald-400/[0.07]",
  },
  overdue: {
    icon: <AlertCircle className="size-4" />,
    color: "text-red-400",
    band: "bg-red-400/[0.07]",
  },
  today: {
    icon: <Sun className="size-4" />,
    color: "text-primary-400",
    band: "bg-primary-400/[0.08]",
  },
  week: {
    icon: <CalendarDays className="size-4" />,
    color: "text-sky-400",
    band: "bg-sky-400/[0.06]",
  },
  later: {
    icon: <CalendarClock className="size-4" />,
    color: "text-indigo-300",
    band: "bg-indigo-300/[0.06]",
  },
  someday: {
    icon: <DashedCircle />,
    color: "text-white/40",
    band: "bg-white/[0.035]",
  },
};

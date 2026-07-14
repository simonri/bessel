import { format } from "date-fns";
import { useRef, useState } from "react";
import { activityLevel, fmtDur } from "./-activity-utils";

// 5 intensity levels for the year grid (GitHub-style)
const GRID_ALPHA = [0.07, 0.28, 0.5, 0.72, 0.92];

export type SleepGridDay =
  | { d: Date; dateStr: string; asleep_secs: number }
  | null;

export function SleepGridCell({
  day,
  col,
  row,
  isSelected,
  isToday,
  maxYearSecs,
  onClick,
}: {
  day: NonNullable<SleepGridDay>;
  col: number;
  row: number;
  isSelected: boolean;
  isToday: boolean;
  maxYearSecs: number;
  onClick: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    timer.current = setTimeout(() => setVisible(true), 800);
  };

  const handleMouseLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative aspect-square rounded-[2px] transition-shadow cursor-pointer ${
        isSelected
          ? "ring-1 ring-inset ring-white/60"
          : isToday
            ? "ring-1 ring-inset ring-white/25"
            : ""
      }`}
      style={{
        gridColumn: col,
        gridRow: row,
        background: `rgba(129,140,248,${GRID_ALPHA[activityLevel(day.asleep_secs, maxYearSecs)]})`,
      }}
    >
      {visible && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-10 text-white/80">
          <span className="text-white/50">{format(day.d, "MMM d")} · </span>
          {day.asleep_secs > 0 ? fmtDur(day.asleep_secs) : "No sleep data"}
        </div>
      )}
    </button>
  );
}

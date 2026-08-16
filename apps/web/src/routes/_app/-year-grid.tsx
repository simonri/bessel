import { addDays, format, isSameDay, subDays } from "date-fns";
import { useRef, useState } from "react";
import { activityLevel, fmtDur } from "./-activity-utils";

// 5 intensity levels for the year grid (GitHub-style)
const GRID_ALPHA = [0.07, 0.28, 0.5, 0.72, 0.92];

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

export type YearGridDay = { d: Date; dateStr: string; secs: number } | null;

// Query range for a full calendar year, padded to week boundaries and
// clamped to today (future dates have no data to fetch).
export function yearGridRange(today: Date): [number, number] {
  const year = today.getFullYear();
  const calYearStart = new Date(year, 0, 1);
  const yearGridStart = subDays(calYearStart, calYearStart.getDay());
  const startTs = Math.floor(yearGridStart.getTime() / 1000);
  const endTs = Math.floor(
    new Date(year, today.getMonth(), today.getDate() + 1).getTime() / 1000,
  );
  return [startTs, endTs];
}

// Full calendar year grid: Jan 1 → Dec 31, padded to week boundaries.
// Dates outside the calendar year (padding) are null (empty cells).
export function buildYearGrid(
  year: number,
  dataMap: Map<string, number>,
): YearGridDay[][] {
  const calYearStart = new Date(year, 0, 1);
  const yearGridStart = subDays(calYearStart, calYearStart.getDay()); // Sunday on/before Jan 1
  const calYearEnd = new Date(year, 11, 31);
  const yearGridEnd = addDays(calYearEnd, 6 - calYearEnd.getDay()); // Saturday on/after Dec 31

  const yearGrid: YearGridDay[][] = [];
  let ws = new Date(yearGridStart);
  while (ws <= yearGridEnd) {
    const week: YearGridDay[] = [];
    for (let di = 0; di < 7; di++) {
      const d = addDays(ws, di);
      if (d.getFullYear() !== year) {
        week.push(null);
      } else {
        const dateStr = format(d, "yyyy-MM-dd");
        week.push({ d, dateStr, secs: dataMap.get(dateStr) ?? 0 });
      }
    }
    yearGrid.push(week);
    ws = addDays(ws, 7);
  }
  return yearGrid;
}

function YearGridCell({
  day,
  col,
  row,
  isSelected,
  isToday,
  maxSecs,
  color,
  emptyLabel,
  onClick,
}: {
  day: NonNullable<YearGridDay>;
  col: number;
  row: number;
  isSelected: boolean;
  isToday: boolean;
  maxSecs: number;
  color: string;
  emptyLabel: string;
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
        background: `rgba(${color},${GRID_ALPHA[activityLevel(day.secs, maxSecs)]})`,
      }}
    >
      {visible && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-10 text-white/80">
          <span className="text-white/50">{format(day.d, "MMM d")} · </span>
          {day.secs > 0 ? fmtDur(day.secs) : emptyLabel}
        </div>
      )}
    </button>
  );
}

export function YearGrid<T>({
  year,
  items,
  getDate,
  getValue,
  color,
  emptyLabel,
  selectedDate,
  today,
  onSelectDay,
}: {
  year: number;
  items: T[];
  getDate: (item: T) => string;
  getValue: (item: T) => number;
  color: string;
  emptyLabel: string;
  selectedDate: Date;
  today: Date;
  onSelectDay: (date: Date) => void;
}) {
  const dataMap = new Map(items.map((item) => [getDate(item), getValue(item)]));
  const maxSecs = Math.max(...Array.from(dataMap.values()), 1);
  const yearGrid = buildYearGrid(year, dataMap);

  // Month labels: show at the column where a new month starts
  const monthMarkers: { col: number; label: string }[] = [];
  let prevMonth = -1;
  yearGrid.forEach((week, wi) => {
    const first = week.find((d) => d !== null);
    if (!first) return;
    const m = first.d.getMonth();
    if (m !== prevMonth) {
      monthMarkers.push({ col: wi, label: format(first.d, "MMM") });
      prevMonth = m;
    }
  });

  return (
    <div className="pt-1">
      <p className="mb-3 text-11 font-medium text-white/50">{year}</p>

      {/* Outer flex row: [day labels] [month labels + cells] */}
      <div className="flex gap-1.5">
        {/* Day-of-week labels — flex-1 rows track the grid rows automatically */}
        <div
          className="flex flex-col shrink-0 select-none"
          style={{ gap: "3px" }}
        >
          {DAY_LABELS.map((l, i) => (
            <div
              key={i}
              className="flex-1 flex items-center justify-end text-8 leading-none text-white/50 pr-0.5"
            >
              {l}
            </div>
          ))}
        </div>

        {/* Cell column: month labels + cell grid */}
        <div className="flex-1 min-w-0">
          {/* Month labels: % positioned, clipped so they never overflow */}
          <div className="relative h-3.5 mb-1 overflow-hidden">
            {monthMarkers.map(({ col, label }) => (
              <span
                key={label}
                className="absolute text-9 leading-none font-medium text-white/50 select-none"
                style={{
                  left: `${(col / Math.max(yearGrid.length, 1)) * 100}%`,
                }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Cell grid: uniform 1fr columns so aspect-square resolves correctly */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${yearGrid.length}, 1fr)`,
              gap: "3px",
            }}
          >
            {yearGrid.map((week, wi) =>
              week.map((day, di) =>
                day === null ? (
                  <div
                    key={`${wi}-${di}`}
                    className="aspect-square"
                    style={{ gridColumn: wi + 1, gridRow: di + 1 }}
                  />
                ) : (
                  <YearGridCell
                    key={`${wi}-${di}`}
                    day={day}
                    col={wi + 1}
                    row={di + 1}
                    isSelected={isSameDay(day.d, selectedDate)}
                    isToday={isSameDay(day.d, today)}
                    maxSecs={maxSecs}
                    color={color}
                    emptyLabel={emptyLabel}
                    onClick={() => onSelectDay(day.d)}
                  />
                ),
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

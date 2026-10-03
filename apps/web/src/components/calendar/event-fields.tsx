import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import {
  addDays,
  addMinutes,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SNAP_MINUTES } from "./grid-geometry";

const DAY_MINUTES = 24 * 60;

/** Event details come from whoever sent the invite; only open http(s) links. */
export function httpUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function fmtTime(d: Date): string {
  return format(d, d.getMinutes() === 0 ? "h a" : "h:mm a");
}

export function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function Section({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-0.5 border-t border-white/[0.07] px-2 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One line of the panel: a muted icon column and its content. */
export function Row({
  icon,
  children,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-8 items-start gap-1 text-13", className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-white/40 [&_svg]:size-4">
        {icon}
      </span>
      <div className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center">
        {children}
      </div>
    </div>
  );
}

/** Text that turns into a soft button on hover, like Notion's property values. */
export const plainControlClass =
  "inline-flex h-7 items-center rounded-md px-1.5 text-13 text-white/85 outline-none transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.08] data-[state=open]:bg-white/[0.08] disabled:pointer-events-none";

export const plainFieldClass =
  "h-7 w-full rounded-md bg-transparent px-1.5 text-13 text-white/85 outline-none placeholder:text-white/35 hover:bg-white/[0.04] focus-visible:bg-white/[0.06]";

interface TimeOption {
  value: Date;
  hint?: string;
}

/** Every slot of `day`, plus `current` when it sits between slots. */
export function startTimeOptions(current: Date): TimeOption[] {
  const day = startOfDay(current);
  const options: TimeOption[] = [];
  for (let m = 0; m < DAY_MINUTES; m += SNAP_MINUTES) {
    options.push({ value: addMinutes(day, m) });
  }
  return withCurrent(options, current);
}

/** Ends up to a day after `start`, each labelled with the resulting length. */
export function endTimeOptions(start: Date, current: Date): TimeOption[] {
  const options: TimeOption[] = [];
  for (let m = SNAP_MINUTES; m <= DAY_MINUTES; m += SNAP_MINUTES) {
    options.push({ value: addMinutes(start, m) });
  }
  return withCurrent(options, current).map((o) => ({
    ...o,
    hint: fmtDuration(o.value.getTime() - start.getTime()),
  }));
}

function withCurrent(options: TimeOption[], current: Date): TimeOption[] {
  if (options.some((o) => o.value.getTime() === current.getTime())) {
    return options;
  }
  return [...options, { value: current }].sort(
    (a, b) => a.value.getTime() - b.value.getTime(),
  );
}

export function TimeSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Date;
  options: TimeOption[];
  onChange: (value: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (open) selectedRef.current?.scrollIntoView?.({ block: "center" });
  }, [open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={label} className={plainControlClass}>
        {fmtTime(value)}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-64 w-44 overflow-y-auto rounded-lg border-white/10 p-1"
      >
        <div role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = option.value.getTime() === value.getTime();
            return (
              <button
                key={option.value.getTime()}
                ref={selected ? selectedRef : undefined}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-13 text-white/80 outline-none hover:bg-white/[0.06] focus-visible:bg-white/[0.08]",
                  selected && "bg-white/[0.08] text-white",
                )}
              >
                {fmtTime(option.value)}
                {option.hint && (
                  <span className="text-12 text-white/40">{option.hint}</span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Six weeks starting on the Monday on or before the 1st of `month`. */
export function monthGrid(month: Date): Date[] {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

function MonthPicker({
  value,
  onSelect,
}: {
  value: Date;
  onSelect: (day: Date) => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(value));
  const today = new Date();
  return (
    <div className="w-60 p-2">
      <div className="mb-1 flex items-center justify-between pl-2">
        <span className="text-13 font-medium text-white/85">
          {format(month, "MMMM yyyy")}
        </span>
        <span className="flex">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            className="rounded-md p-1 text-white/50 hover:bg-white/[0.06] hover:text-white/85"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="rounded-md p-1 text-white/50 hover:bg-white/[0.06] hover:text-white/85"
          >
            <ChevronRight className="size-4" />
          </button>
        </span>
      </div>
      <div className="grid grid-cols-7 text-center">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <span key={d} className="py-1 text-11 text-white/35">
            {d}
          </span>
        ))}
        {monthGrid(month).map((day) => {
          const selected = isSameDay(day, value);
          return (
            <button
              key={day.getTime()}
              type="button"
              aria-label={format(day, "EEEE, MMMM d, yyyy")}
              aria-pressed={selected}
              onClick={() => onSelect(day)}
              className={cn(
                "mx-auto flex size-7 items-center justify-center rounded-md text-12 tabular-nums outline-none hover:bg-white/[0.08] focus-visible:bg-white/[0.1]",
                isSameMonth(day, month) ? "text-white/80" : "text-white/25",
                isSameDay(day, today) && "font-semibold text-red-400",
                selected && "bg-primary-500 text-white hover:bg-primary-500",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (day: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={label} className={plainControlClass}>
        {format(value, "EEE MMM d")}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto rounded-lg border-white/10 p-0"
      >
        <MonthPicker
          value={value}
          onSelect={(day) => {
            onChange(day);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

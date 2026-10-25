import type { TaskSchema, TaskUpdate } from "@bessel/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { addDays, format, nextMonday } from "date-fns";
import {
  Calendar,
  Check,
  Flag,
  Folder,
  Plus,
  Repeat,
  Tag,
  X,
} from "lucide-react";
import { forwardRef, useState } from "react";
import {
  describeDue,
  formatRecurrence,
  PRIORITY_CONFIG,
  parseDueDate,
  STATUS_CONFIG,
} from "@/lib/task-format";
import { parseQuickTask } from "@/lib/task-quick-parse";
import { cn } from "@/lib/utils";

export type TaskStatusValue =
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "cancelled";

const STATUS_ORDER: TaskStatusValue[] = [
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
];
const PRIORITY_ORDER = [4, 3, 2, 1, 0];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FREQUENCIES = [
  { value: "daily", label: "Day" },
  { value: "weekly", label: "Week" },
  { value: "monthly", label: "Month" },
  { value: "yearly", label: "Year" },
] as const;

/** The API stores due dates as days, and reads a date at UTC midnight as that day. */
export function dueDay(local: Date): Date {
  return new Date(
    Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()),
  );
}

export function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2 md:grid-cols-1 md:gap-1">
      <span className="text-12 text-white/45">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const PropertyButton = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { empty?: boolean }
>(function PropertyButton({ empty, className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "-mx-2 flex h-7 w-[calc(100%+1rem)] min-w-0 items-center gap-2 rounded-md px-2 text-left text-13 transition-colors duration-150 hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none data-[state=open]:bg-white/[0.06]",
        empty ? "text-white/35" : "text-white/85",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

function StatusIcon({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.todo;
  const Icon = config.icon;
  return <Icon className={cn("size-3.5 shrink-0", config.color)} />;
}

export function StatusPicker({
  status,
  onChange,
}: {
  status: string;
  onChange: (status: TaskStatusValue) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyButton
          aria-label={`Status: ${STATUS_CONFIG[status]?.label ?? status}`}
        >
          <StatusIcon status={status} />
          <span className="truncate">
            {STATUS_CONFIG[status]?.label ?? status}
          </span>
        </PropertyButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {STATUS_ORDER.map((value) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => value !== status && onChange(value)}
          >
            <StatusIcon status={value} />
            {STATUS_CONFIG[value].label}
            {value === status && (
              <Check className="ml-auto size-3.5 text-white/60" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PriorityIcon({ priority }: { priority: number }) {
  const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[0];
  return (
    <Flag
      className={cn(
        "size-3.5 shrink-0",
        config.color,
        priority >= 3 && "fill-current",
      )}
    />
  );
}

export function PriorityPicker({
  priority,
  onChange,
}: {
  priority: number;
  onChange: (priority: number) => void;
}) {
  const label =
    priority === 0
      ? "No priority"
      : (PRIORITY_CONFIG[priority]?.label ?? "None");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyButton
          empty={priority === 0}
          aria-label={`Priority: ${label}`}
        >
          <PriorityIcon priority={priority} />
          <span className="truncate">{label}</span>
        </PropertyButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {PRIORITY_ORDER.map((value) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => value !== priority && onChange(value)}
          >
            <PriorityIcon priority={value} />
            {value === 0 ? "No priority" : PRIORITY_CONFIG[value].label}
            {value === priority && (
              <Check className="ml-auto size-3.5 text-white/60" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const DUE_TONE = {
  overdue: "text-red-300",
  today: "text-primary-300",
  upcoming: "text-white/85",
} as const;

export function DuePicker({
  due,
  onChange,
}: {
  due: Date | string | null | undefined;
  onChange: (due: Date | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const info = describeDue(due);
  const today = new Date();
  const typedDay = typed.trim()
    ? parseQuickTask(`x ${typed.trim()}`, []).dueDate
    : null;
  const pick = (day: Date | null) => {
    onChange(day ? dueDay(day) : null);
    setTyped("");
    setOpen(false);
  };
  // On a Sunday, tomorrow is next Monday: each day is offered once.
  const quick = (
    [
      ["Today", today],
      ["Tomorrow", addDays(today, 1)],
      ["Next Monday", nextMonday(today)],
      ["In a week", addDays(today, 7)],
    ] as [string, Date][]
  ).filter(
    ([, day], i, all) =>
      all.findIndex(
        ([, other]) => other.toDateString() === day.toDateString(),
      ) === i,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PropertyButton
          empty={!info}
          aria-label={info ? `Due: ${info.label}` : "Add due date"}
        >
          <Calendar
            className={cn("size-3.5 shrink-0", info ? DUE_TONE[info.tone] : "")}
          />
          <span className={cn("truncate", info && DUE_TONE[info.tone])}>
            {info
              ? `${info.label}${info.tone === "upcoming" && due ? ` - ${format(parseDueDate(due), "d MMM")}` : ""}`
              : "Add due date"}
          </span>
        </PropertyButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1.5">
        <input
          aria-label="Type a due date"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && typedDay) {
              e.preventDefault();
              pick(typedDay);
            }
          }}
          placeholder="Try fri, tomorrow or 12/3"
          className="mb-1 h-8 w-full rounded-md bg-white/[0.05] px-2 text-13 text-white/85 outline-none placeholder:text-white/30 focus:bg-white/[0.08]"
        />
        {typed.trim() && (
          <button
            type="button"
            disabled={!typedDay}
            onClick={() => typedDay && pick(typedDay)}
            className="mb-1 flex h-8 w-full items-center rounded-md px-2 text-left text-13 text-white/80 hover:bg-white/[0.06] disabled:text-white/30 disabled:hover:bg-transparent"
          >
            {typedDay ? format(typedDay, "EEEE d MMMM") : "Not a date I know"}
          </button>
        )}
        {quick.map(([label, day]) => (
          <button
            key={label}
            type="button"
            onClick={() => pick(day)}
            className="flex h-8 w-full items-center justify-between rounded-md px-2 text-13 text-white/80 hover:bg-white/[0.06]"
          >
            {label}
            <span className="text-12 text-white/35">
              {format(day, "EEE d MMM")}
            </span>
          </button>
        ))}
        <div className="my-1 h-px bg-white/[0.08]" />
        <label className="flex h-8 items-center justify-between gap-2 rounded-md px-2 text-13 text-white/80">
          Pick a day
          <input
            type="date"
            aria-label="Pick a day"
            value={due ? format(parseDueDate(due), "yyyy-MM-dd") : ""}
            onChange={(e) => {
              if (!e.target.value) return;
              const [y, m, d] = e.target.value.split("-").map(Number);
              pick(new Date(y, m - 1, d));
            }}
            className="rounded bg-white/[0.05] px-1.5 py-0.5 text-12 text-white/80 [color-scheme:dark]"
          />
        </label>
        {due && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="flex h-8 w-full items-center rounded-md px-2 text-13 text-white/55 hover:bg-white/[0.06] hover:text-white/80"
          >
            Remove due date
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function RepeatPicker({
  task,
  onChange,
}: {
  task: TaskSchema;
  onChange: (body: TaskUpdate) => void;
}) {
  const label = formatRecurrence(task);
  const frequency = task.is_recurring ? task.rrule_frequency : null;
  const interval = task.rrule_interval ?? 1;
  const set = (body: TaskUpdate) =>
    onChange({
      is_recurring: true,
      rrule_frequency: frequency,
      rrule_interval: interval,
      rrule_day_of_week: task.rrule_day_of_week ?? null,
      rrule_day_of_month: task.rrule_day_of_month ?? null,
      ...body,
    });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <PropertyButton
          empty={!label}
          aria-label={label ? `Repeats: ${label}` : "Add repeat"}
        >
          <Repeat className="size-3.5 shrink-0" />
          <span className="truncate">{label ?? "Doesn't repeat"}</span>
        </PropertyButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 p-3">
        <div className="flex items-center gap-2 text-13 text-white/70">
          Every
          <input
            type="number"
            min={1}
            max={99}
            aria-label="Repeat interval"
            value={frequency ? interval : 1}
            disabled={!frequency}
            onChange={(e) => {
              const next = Math.max(
                1,
                Math.min(99, Number(e.target.value) || 1),
              );
              if (next !== interval) set({ rrule_interval: next });
            }}
            className="h-7 w-12 rounded-md bg-white/[0.05] px-2 text-13 text-white/85 outline-none disabled:opacity-40"
          />
        </div>
        <div className="grid grid-cols-4 gap-1">
          {FREQUENCIES.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={frequency === f.value}
              onClick={() =>
                frequency !== f.value &&
                set({
                  rrule_frequency: f.value,
                  rrule_day_of_week: null,
                  rrule_day_of_month: null,
                })
              }
              className={cn(
                "h-7 rounded-md text-12 transition-colors",
                frequency === f.value
                  ? "bg-white/[0.12] text-white"
                  : "text-white/60 hover:bg-white/[0.06]",
              )}
            >
              {interval > 1 && frequency === f.value ? `${f.label}s` : f.label}
            </button>
          ))}
        </div>
        {frequency === "weekly" && (
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day, i) => (
              <button
                key={day}
                type="button"
                aria-pressed={task.rrule_day_of_week === i}
                onClick={() =>
                  set({
                    rrule_day_of_week: task.rrule_day_of_week === i ? null : i,
                  })
                }
                className={cn(
                  "h-7 rounded-md text-11 transition-colors",
                  task.rrule_day_of_week === i
                    ? "bg-white/[0.12] text-white"
                    : "text-white/55 hover:bg-white/[0.06]",
                )}
              >
                {day}
              </button>
            ))}
          </div>
        )}
        {frequency === "monthly" && (
          <label className="flex items-center gap-2 text-13 text-white/70">
            On day
            <input
              type="number"
              min={1}
              max={31}
              aria-label="Day of the month"
              value={task.rrule_day_of_month ?? ""}
              placeholder="due day"
              onChange={(e) => {
                const day = Number(e.target.value);
                set({ rrule_day_of_month: day >= 1 && day <= 31 ? day : null });
              }}
              className="h-7 w-20 rounded-md bg-white/[0.05] px-2 text-13 text-white/85 outline-none placeholder:text-white/30"
            />
          </label>
        )}
        <p className="text-11 leading-relaxed text-white/40">
          {frequency
            ? "When you complete it, the next one is added from its due date."
            : "Pick how often it comes back after you complete it."}
        </p>
        {frequency && (
          <button
            type="button"
            onClick={() =>
              onChange({
                is_recurring: false,
                rrule_frequency: null,
                rrule_interval: null,
                rrule_day_of_week: null,
                rrule_day_of_month: null,
              })
            }
            className="text-12 text-white/55 hover:text-white/85"
          >
            Stop repeating
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ProjectPicker({
  project,
  projects,
  onChange,
}: {
  project: string | null | undefined;
  projects: string[];
  onChange: (project: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wanted = query.trim();
  const matches = projects.filter((p) =>
    p.toLowerCase().includes(wanted.toLowerCase()),
  );
  const isNew =
    wanted && !projects.some((p) => p.toLowerCase() === wanted.toLowerCase());
  const pick = (value: string | null) => {
    if (value !== (project ?? null)) onChange(value);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PropertyButton
          empty={!project}
          aria-label={project ? `Project: ${project}` : "Add to project"}
        >
          <Folder className="size-3.5 shrink-0" />
          <span className="truncate">{project ?? "No project"}</span>
        </PropertyButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1.5">
        <input
          aria-label="Find or create a project"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !wanted) return;
            e.preventDefault();
            pick(
              matches.find((p) => p.toLowerCase() === wanted.toLowerCase()) ??
                (isNew ? wanted : matches[0]),
            );
          }}
          placeholder="Find or create a project"
          className="mb-1 h-8 w-full rounded-md bg-white/[0.05] px-2 text-13 text-white/85 outline-none placeholder:text-white/30 focus:bg-white/[0.08]"
        />
        <div className="max-h-56 overflow-y-auto">
          {matches.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => pick(p)}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-13 text-white/80 hover:bg-white/[0.06]"
            >
              <span className="truncate">{p}</span>
              {p === project && (
                <Check className="ml-auto size-3.5 shrink-0 text-white/60" />
              )}
            </button>
          ))}
          {isNew && (
            <button
              type="button"
              onClick={() => pick(wanted)}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-13 text-white/80 hover:bg-white/[0.06]"
            >
              <Plus className="size-3.5 shrink-0" />
              <span className="truncate">Create “{wanted}”</span>
            </button>
          )}
          {project && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="flex h-8 w-full items-center rounded-md px-2 text-left text-13 text-white/55 hover:bg-white/[0.06] hover:text-white/80"
            >
              Remove from project
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TagsEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const add = () => {
    const fresh = value
      .split(",")
      .map((t) => t.trim())
      .filter(
        (t) =>
          t &&
          !tags.some((existing) => existing.toLowerCase() === t.toLowerCase()),
      );
    if (fresh.length > 0) onChange([...tags, ...fresh]);
    setValue("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-6 items-center gap-1 rounded-full bg-white/[0.07] pr-1 pl-2 text-12 text-white/75"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="flex size-4 items-center justify-center rounded-full text-white/45 hover:bg-white/[0.1] hover:text-white/85"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: opened by the user's click on "Add tag"
          autoFocus
          aria-label="New tag"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Escape") {
              setValue("");
              setAdding(false);
            }
          }}
          onBlur={() => {
            add();
            setAdding(false);
          }}
          placeholder="Tag name"
          className="h-6 w-28 rounded-full bg-white/[0.05] px-2 text-12 text-white/85 outline-none placeholder:text-white/30"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-full px-2 text-12 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/75",
            tags.length === 0 && "-mx-2",
          )}
        >
          {tags.length === 0 ? (
            <Tag className="size-3.5" />
          ) : (
            <Plus className="size-3" />
          )}
          {tags.length === 0 ? "Add tag" : "Tag"}
        </button>
      )}
    </div>
  );
}

import type { TimeEntrySchema, TimeProjectSchema } from "@bessel/client";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "@bessel/ui/components/context-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { addDays, addHours, format, isSameDay, isSameMonth } from "date-fns";
import { Check, ChevronLeft, ChevronRight, Moon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { IconButton, PeriodNav, SoftButton } from "@/components/ui-kit";
import { userStorage } from "@/lib/user-storage";
import { cn } from "@/lib/utils";
import { headerMonth } from "../calendar/calendar-dates";
import { useCalendarNavigation } from "../calendar/calendar-page";
import {
  fromWallClock,
  toWallClock,
  useCalendarTimeZone,
} from "../calendar/calendar-timezone";
import type {
  CalendarViewMode,
  TimedGridEvent,
} from "../calendar/calendar-types";
import { DRAFT_ID, TimeGrid } from "../calendar/time-grid";
import { EntryPopover, type EntrySubject } from "./entry-popover";
import { MonthTable } from "./month-table";
import { ProjectsPopover } from "./projects-popover";
import {
  formatHours,
  monthRows,
  nextProjectColor,
  overlappingIds,
  projectTotals,
} from "./time-format";
import {
  type TimeWrites,
  useHasRecentSleep,
  useSleepBands,
  useTimeEntries,
  useTimeProjects,
  useTimeSummary,
  useTimeWrites,
} from "./use-time-tracking";

type TimeView = "calendar" | "months";

const PAGE_VIEW_KEY = "bessel:time-view";
const GRID_VIEW_KEY = "bessel:time-calendar-view";
const LAST_PROJECT_KEY = "bessel:time-last-project";
const SHOW_SLEEP_KEY = "bessel:time-show-sleep";
const FALLBACK_COLOR = "#6b7280";
/** A day here runs 4 am to 4 am, so late nights count to the day before. */
const DAY_START_HOUR = 4;

function workDay(timeZone: string): Date {
  return addHours(toWallClock(new Date(), timeZone), -DAY_START_HOUR);
}

function rememberedPageView(): TimeView {
  return userStorage.getItem(PAGE_VIEW_KEY) === "months"
    ? "months"
    : "calendar";
}

export function TimePage() {
  const [timeZone, setTimeZone] = useCalendarTimeZone();
  const nav = useCalendarNavigation(timeZone, GRID_VIEW_KEY, DAY_START_HOUR);
  const [page, setPageState] = useState(rememberedPageView);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const projects = useTimeProjects() ?? [];
  const writes = useTimeWrites();

  const setPage = (next: TimeView) => {
    setPageState(next);
    userStorage.setItem(PAGE_VIEW_KEY, next);
  };

  const switcher = (
    <div
      role="tablist"
      aria-label="View"
      className="flex h-7 items-center rounded-md bg-white/[0.06] p-0.5"
    >
      {(["calendar", "months"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={page === v}
          onClick={() => setPage(v)}
          className={cn(
            "h-full rounded-[5px] px-2.5 text-12 font-medium transition-colors duration-150",
            page === v
              ? "bg-white/[0.1] text-white/90"
              : "text-white/50 hover:text-white/80",
          )}
        >
          {v === "calendar" ? "Calendar" : "Months"}
        </button>
      ))}
    </div>
  );

  return page === "calendar" ? (
    <CalendarTime
      nav={nav}
      timeZone={timeZone}
      onTimeZoneChange={setTimeZone}
      projects={projects}
      writes={writes}
      switcher={switcher}
    />
  ) : (
    <MonthsTime
      year={year}
      onYearChange={setYear}
      timeZone={timeZone}
      projects={projects}
      writes={writes}
      switcher={switcher}
      onOpenMonth={(month) => {
        const now = toWallClock(new Date(), timeZone);
        const first = new Date(year, month, 1);
        nav.setDate(isSameMonth(first, now) ? now : first);
        setPage("calendar");
      }}
    />
  );
}

function Header({
  summary,
  children,
}: {
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 px-4 pt-3 pb-2">
      <div className="min-w-0">
        <h2 className="type-title text-white/90">Time</h2>
        <p className="mt-0.5 text-13 text-white/50">{summary}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}

function periodPhrase(days: Date[], view: CalendarViewMode, today: Date) {
  const showsToday = days.some((d) => isSameDay(d, today));
  if (view === "day")
    return showsToday ? "today" : `on ${format(days[0], "EEE d MMM")}`;
  if (view === "centered") return "these 7 days";
  return showsToday ? "this week" : `the week of ${format(days[0], "d MMM")}`;
}

type Selection =
  | { kind: "draft"; start: Date; end: Date }
  | { kind: "entry"; entryId: string };

function CalendarTime({
  nav: { view, days, setDate, setView },
  timeZone,
  onTimeZoneChange,
  projects,
  writes,
  switcher,
}: {
  nav: ReturnType<typeof useCalendarNavigation>;
  timeZone: string;
  onTimeZoneChange: (timeZone: string) => void;
  projects: TimeProjectSchema[];
  writes: TimeWrites;
  switcher: React.ReactNode;
}) {
  const today = workDay(timeZone);
  const { data: entries = [] } = useTimeEntries(
    addDays(days[0], -1),
    addDays(days[days.length - 1], 2),
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const activeProjects = projects.filter((p) => !p.archived_at);
  const lastProjectId = userStorage.getItem(LAST_PROJECT_KEY);
  const defaultProjectId =
    activeProjects.find((p) => p.id === lastProjectId)?.id ??
    activeProjects[0]?.id ??
    null;

  // Changing the shown days drops a selection whose chip went away.
  const rangeKey = `${view}:${days[0].toDateString()}`;
  const [selectionRange, setSelectionRange] = useState(rangeKey);
  if (selectionRange !== rangeKey) {
    setSelectionRange(rangeKey);
    setSelection(null);
  }

  const rangeStart = fromWallClock(addHours(days[0], DAY_START_HOUR), timeZone);
  const rangeEnd = fromWallClock(
    addHours(addDays(days[days.length - 1], 1), DAY_START_HOUR),
    timeZone,
  );

  const hasSleep = useHasRecentSleep(timeZone);
  const [showSleep, setShowSleep] = useState(
    () => userStorage.getItem(SHOW_SLEEP_KEY) !== "false",
  );
  const sleepShown = hasSleep && showSleep;
  const sleep = useSleepBands(rangeStart, rangeEnd, sleepShown);
  const sleepBackgrounds = sleepShown
    ? sleep.map((band) => ({
        id: `sleep-${band.start}`,
        start: toWallClock(new Date(band.start * 1000), timeZone),
        end: toWallClock(new Date(band.end * 1000), timeZone),
        label: `Sleep ${formatHours(band.asleepSecs)}`,
      }))
    : [];
  const shownEntries = entries.filter(
    (e) => e.start_ts < rangeEnd && e.end_ts > rangeStart,
  );
  const totals = projectTotals(shownEntries, rangeStart, rangeEnd);
  const totalSeconds = totals.reduce((sum, t) => sum + t.seconds, 0);
  const overlaps = overlappingIds(shownEntries).size;

  const titleOf = (entry: TimeEntrySchema) => {
    const name = projectById.get(entry.time_project_id)?.name ?? "Project";
    return entry.note ? `${name} - ${entry.note}` : name;
  };
  const gridEvents: TimedGridEvent[] = entries.map((entry) => ({
    id: entry.id,
    calendarId: entry.time_project_id,
    title: titleOf(entry),
    details: { colorId: null, myResponse: null },
    allDay: false,
    start: toWallClock(entry.start_ts, timeZone),
    end: toWallClock(entry.end_ts, timeZone),
  }));
  if (selection?.kind === "draft") {
    gridEvents.push({
      id: DRAFT_ID,
      calendarId: defaultProjectId ?? "",
      title: projectById.get(defaultProjectId ?? "")?.name ?? "New entry",
      details: { colorId: null, myResponse: null },
      allDay: false,
      start: selection.start,
      end: selection.end,
    });
  }
  const editableIds = new Set(
    entries.filter((e) => !e.id.startsWith("temp-")).map((e) => e.id),
  );

  const selectedEntry =
    selection?.kind === "entry"
      ? (entries.find((e) => e.id === selection.entryId) ?? null)
      : null;
  const subject: EntrySubject | null =
    selection?.kind === "draft"
      ? {
          entryId: null,
          start: selection.start,
          end: selection.end,
          projectId: defaultProjectId,
          note: "",
        }
      : selectedEntry
        ? {
            entryId: selectedEntry.id,
            start: toWallClock(selectedEntry.start_ts, timeZone),
            end: toWallClock(selectedEntry.end_ts, timeZone),
            projectId: selectedEntry.time_project_id,
            note: selectedEntry.note ?? "",
          }
        : null;
  // The entry's own project stays pickable after it's archived.
  const pickable =
    selectedEntry &&
    !activeProjects.some((p) => p.id === selectedEntry.time_project_id)
      ? [
          ...activeProjects,
          ...projects.filter((p) => p.id === selectedEntry.time_project_id),
        ]
      : activeProjects;

  const remove = (entry: TimeEntrySchema) => {
    setSelection(null);
    writes
      .deleteEntry(entry)
      .then(() =>
        toast("Entry deleted", {
          action: {
            label: "Undo",
            onClick: () =>
              void writes
                .createEntry({
                  time_project_id: entry.time_project_id,
                  start_ts: entry.start_ts,
                  end_ts: entry.end_ts,
                  note: entry.note,
                })
                .catch(() => {}),
          },
        }),
      )
      .catch(() => {});
  };

  useEffect(() => {
    if (!selectedEntry) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
      remove(selectedEntry);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const save = (projectId: string, note: string) => {
    userStorage.setItem(LAST_PROJECT_KEY, projectId);
    setSelection(null);
    if (selection?.kind === "draft") {
      void writes
        .createEntry({
          time_project_id: projectId,
          start_ts: fromWallClock(selection.start, timeZone),
          end_ts: fromWallClock(selection.end, timeZone),
          note: note || null,
        })
        .catch(() => {});
    } else if (selectedEntry) {
      void writes
        .updateEntry(selectedEntry, {
          time_project_id: projectId,
          note: note || null,
        })
        .catch(() => {});
    }
  };

  const renderMenu = (event: TimedGridEvent) => {
    const entry = entries.find((e) => e.id === event.id);
    if (!entry) return null;
    return (
      <ContextMenuContent
        className="min-w-52 p-1"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {activeProjects.map((project) => (
          <ContextMenuItem
            key={project.id}
            onSelect={() => {
              if (project.id === entry.time_project_id) return;
              userStorage.setItem(LAST_PROJECT_KEY, project.id);
              void writes
                .updateEntry(entry, { time_project_id: project.id })
                .catch(() => {});
            }}
            className="gap-2.5 px-2.5"
          >
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: project.color }}
            />
            <span className="flex-1 truncate">{project.name}</span>
            {project.id === entry.time_project_id && (
              <Check className="text-white/60" />
            )}
          </ContextMenuItem>
        ))}
        {activeProjects.length > 0 && <ContextMenuSeparator />}
        <ContextMenuItem
          variant="destructive"
          onSelect={() => remove(entry)}
          className="gap-2.5 px-2.5"
        >
          <Trash2 />
          Delete
          <ContextMenuShortcut className="tracking-normal">
            delete
          </ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    );
  };

  const phrase = periodPhrase(days, view, today);
  const summary =
    totalSeconds > 0
      ? `${formatHours(totalSeconds)} logged ${phrase}${overlaps > 0 ? ` - ${overlaps} entries overlap` : ""}`
      : projects.length === 0
        ? "Drag on the calendar to log time. You'll name your first project as you go."
        : `Nothing logged ${phrase}. Drag on the calendar to add time.`;
  const step = view === "day" ? 1 : 7;
  const unit = view === "day" ? "day" : "week";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header summary={summary}>
        {switcher}
        <ProjectsPopover projects={projects} writes={writes} />
      </Header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-2">
        <span className="mr-auto text-13 font-medium text-white/80">
          {headerMonth(days, today)}
        </span>
        {hasSleep && (
          <SoftButton
            aria-pressed={showSleep}
            title={showSleep ? "Hide sleep" : "Show sleep"}
            onClick={() => {
              setShowSleep(!showSleep);
              userStorage.setItem(SHOW_SLEEP_KEY, String(!showSleep));
            }}
            className={cn(
              showSleep &&
                "bg-indigo-400/15 text-indigo-200 hover:bg-indigo-400/20",
            )}
          >
            <Moon />
            Sleep
          </SoftButton>
        )}
        <Select
          value={view}
          onValueChange={(v) => setView(v as CalendarViewMode)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Days shown"
            className="w-auto min-w-24 border-transparent bg-white/[0.06] font-medium text-white/75 shadow-none hover:border-transparent hover:bg-white/[0.1] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="centered">Today in middle</SelectItem>
            <SelectItem value="day">Day</SelectItem>
          </SelectContent>
        </Select>
        <SoftButton onClick={() => setDate(workDay(timeZone))}>
          Today
        </SoftButton>
        <div className="flex">
          <IconButton
            title={`Previous ${unit}`}
            onClick={() => setDate((d) => addDays(d, -step))}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton
            title={`Next ${unit}`}
            onClick={() => setDate((d) => addDays(d, step))}
          >
            <ChevronRight />
          </IconButton>
        </div>
      </div>

      {totals.length > 0 && (
        <ul
          aria-label="Hours per project"
          className="flex shrink-0 flex-wrap gap-1.5 px-4 pb-2"
        >
          {totals.map(({ projectId, seconds }) => {
            const project = projectById.get(projectId);
            return (
              <li
                key={projectId}
                className="flex h-6 items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 text-12 text-white/70"
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: project?.color ?? FALLBACK_COLOR }}
                />
                {project?.name ?? "Project"}
                <span className="tabular-nums text-white/45">
                  {formatHours(seconds)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <TimeGrid
        days={days}
        events={gridEvents}
        colorOf={(id) => projectById.get(id)?.color ?? FALLBACK_COLOR}
        selectedEventId={
          selection?.kind === "draft" ? DRAFT_ID : (selectedEntry?.id ?? null)
        }
        editableIds={editableIds}
        renderMenu={renderMenu}
        canCreate
        showAllDay={false}
        dayStartHour={DAY_START_HOUR}
        backgrounds={sleepBackgrounds}
        timeZone={timeZone}
        onTimeZoneChange={onTimeZoneChange}
        onSelectDay={(day) => {
          setDate(day);
          setView("day");
        }}
        onSelectEvent={(id) =>
          setSelection((current) =>
            current?.kind === "entry" && current.entryId === id
              ? null
              : { kind: "entry", entryId: id },
          )
        }
        onSelectedAnchor={setAnchor}
        onCreate={(timing) =>
          setSelection({ kind: "draft", start: timing.start, end: timing.end })
        }
        onMove={(id, timing) => {
          const entry = entries.find((e) => e.id === id);
          if (!entry) return;
          void writes
            .updateEntry(entry, {
              start_ts: fromWallClock(timing.start, timeZone),
              end_ts: fromWallClock(timing.end, timeZone),
            })
            .catch(() => {});
        }}
      />
      <EntryPopover
        subject={subject}
        anchor={anchor}
        projects={pickable}
        onSave={save}
        onDelete={() => selectedEntry && remove(selectedEntry)}
        onClose={() => setSelection(null)}
        onCreateProject={(name) =>
          writes.createProject({
            name,
            color: nextProjectColor(projects),
          })
        }
      />
    </div>
  );
}

function MonthsTime({
  year,
  onYearChange,
  timeZone,
  projects,
  writes,
  switcher,
  onOpenMonth,
}: {
  year: number;
  onYearChange: (year: number) => void;
  timeZone: string;
  projects: TimeProjectSchema[];
  writes: TimeWrites;
  switcher: React.ReactNode;
  onOpenMonth: (month: number) => void;
}) {
  const { data } = useTimeSummary(year, timeZone);
  const rows = monthRows(data?.totals ?? [], projects);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const now = toWallClock(new Date(), timeZone);
  const summary =
    total > 0
      ? `${formatHours(total)} in ${year} - click a month name to copy it`
      : `Nothing logged in ${year}.`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header summary={summary}>
        {switcher}
        <PeriodNav
          label={year}
          onPrev={() => onYearChange(year - 1)}
          onNext={() => onYearChange(year + 1)}
          nextDisabled={year >= now.getFullYear()}
        />
        <ProjectsPopover projects={projects} writes={writes} />
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
        {rows.length > 0 ? (
          <MonthTable
            year={year}
            rows={rows}
            currentMonth={year === now.getFullYear() ? now.getMonth() : null}
            onOpenMonth={onOpenMonth}
          />
        ) : (
          <p className="py-10 text-center text-13 text-white/45">
            Add a project and log some time to see your months here.
          </p>
        )}
      </div>
    </div>
  );
}

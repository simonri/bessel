import {
  getActivitySummaryV1ActivitySummaryGetOptions,
  getDailySleepV1HealthkitSleepDailyGetOptions,
  listActivitySourcesV1ActivitySourcesGetOptions,
  listCalendarEventsV1CalendarsEventsGetOptions,
  listTasksV1TasksGetOptions,
  type TaskSchema,
  TaskStatus,
} from "@bessel/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowRight, Play } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { TimedCalendarEvent } from "@/components/calendar/calendar-types";
import { toCalendarEvent } from "@/components/calendar/use-calendar-data";
import { useOpenPage } from "@/components/open-page-context";
import type { PageKey } from "@/components/pages";
import { localNightBounds } from "@/components/sleep/sleep-summary";
import { TaskDetailDialogController } from "@/components/task-detail-dialog";
import { TaskRow } from "@/components/tasks/task-row";
import { PageHeader, SoftButton } from "@/components/ui-kit";
import { useTaskStatusActions } from "@/hooks/use-task-status-actions";
import { client } from "@/lib/client";
import {
  countdown,
  nextEvent,
  screenSentence,
  sleepSentence,
  todayTasks,
} from "./today-summary";

const CARD = "rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]";
const UPCOMING_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** Re-renders every minute so countdowns stay current. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function Block({
  title,
  page,
  linkLabel,
  children,
}: {
  title: string;
  page: PageKey;
  linkLabel: string;
  children: ReactNode;
}) {
  const openPage = useOpenPage();
  return (
    <section className={CARD}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-13 font-medium text-white/60">{title}</h3>
        <button
          type="button"
          onClick={() => openPage(page)}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-12 text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/80"
        >
          {linkLabel}
          <ArrowRight className="size-3" />
        </button>
      </div>
      {children}
    </section>
  );
}

function useUpcomingEvents(now: Date) {
  const startTs = Math.floor(now.getTime() / 1000) - 12 * 60 * 60;
  const endTs = Math.floor((now.getTime() + UPCOMING_WINDOW_MS) / 1000);
  // Rounded to the hour so the query key (and the request) stays stable
  // while the minute clock ticks.
  const hour = 3600;
  const { data } = useQuery(
    listCalendarEventsV1CalendarsEventsGetOptions({
      client,
      query: {
        start_ts: Math.floor(startTs / hour) * hour,
        end_ts: Math.ceil(endTs / hour) * hour,
      },
    }),
  );
  return (data?.events ?? [])
    .map(toCalendarEvent)
    .filter((e): e is TimedCalendarEvent => e !== null && !e.allDay);
}

function NextUp({ now }: { now: Date }) {
  const events = useUpcomingEvents(now);
  const next = nextEvent(events, now);
  return (
    <Block title="Next up" page="calendar" linkLabel="Calendar">
      {next ? (
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-15 font-medium text-white/90">
              {next.event.title || "(No title)"}
            </p>
            <p className="mt-0.5 text-12 text-white/50">
              {format(next.event.start, "EEE HH:mm")} -{" "}
              {format(next.event.end, "HH:mm")}
              {next.event.details.location
                ? ` - ${next.event.details.location}`
                : ""}
            </p>
          </div>
          <span className="shrink-0 text-13 font-medium tabular-nums text-primary-300">
            {next.ongoing
              ? `now, until ${format(next.event.end, "HH:mm")}`
              : countdown(now, next.event.start)}
          </span>
        </div>
      ) : (
        <p className="text-13 text-white/45">
          Nothing on your calendar for the next two days.
        </p>
      )}
    </Block>
  );
}

function TaskList({
  label,
  tasks,
  onSelect,
  onComplete,
  onStart,
}: {
  label: string;
  tasks: TaskSchema[];
  onSelect: (task: TaskSchema) => void;
  onComplete: (task: TaskSchema) => void;
  onStart?: (task: TaskSchema) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <p className="px-2.5 pb-1 text-11 font-semibold text-white/40">{label}</p>
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <TaskRow
              task={task}
              onSelect={() => onSelect(task)}
              onComplete={() => onComplete(task)}
            />
          </div>
          {onStart && (
            <SoftButton onClick={() => onStart(task)} title="Start">
              <Play />
              Start
            </SoftButton>
          )}
        </div>
      ))}
    </div>
  );
}

function TasksBlock({ now }: { now: Date }) {
  const { data } = useQuery(
    listTasksV1TasksGetOptions({
      client,
      query: {
        page: 1,
        limit: 100,
        status: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW],
        sorting: ["position" as "-created_at"],
      },
    }),
  );
  const actions = useTaskStatusActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { doing, inReview, due, moreDue } = todayTasks(data?.items ?? [], now);
  const select = (task: TaskSchema) => setSelectedId(task.id);
  const empty = doing.length + inReview.length + due.length === 0;

  return (
    <Block title="Tasks" page="tasks" linkLabel="All tasks">
      {empty ? (
        <p className="text-13 text-white/45">
          Nothing due today. Pick something from your tasks when you're ready.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <TaskList
            label="Doing"
            tasks={doing}
            onSelect={select}
            onComplete={actions.complete}
          />
          <TaskList
            label="In review"
            tasks={inReview}
            onSelect={select}
            onComplete={actions.complete}
          />
          <TaskList
            label="To do today"
            tasks={due}
            onSelect={select}
            onComplete={actions.complete}
            onStart={actions.start}
          />
          {moreDue > 0 && (
            <p className="px-2.5 text-12 text-white/40">
              And {moreDue} more due today or earlier.
            </p>
          )}
        </div>
      )}
      <TaskDetailDialogController
        taskId={selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </Block>
  );
}

function SleepBlock({ now }: { now: Date }) {
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [startTs, endTs] = localNightBounds(now);
  const { data } = useQuery(
    getDailySleepV1HealthkitSleepDailyGetOptions({
      client,
      query: { start_ts: startTs, end_ts: endTs, tz_name: tzName },
    }),
  );
  const night =
    data?.nights.find((n) => n.date === format(now, "yyyy-MM-dd")) ?? null;
  return (
    <Block title="Last night" page="sleep" linkLabel="Sleep">
      <p className="text-13 text-white/80">{sleepSentence(night)}</p>
    </Block>
  );
}

function ScreenTimeBlock({ now }: { now: Date }) {
  const { data: sources } = useQuery(
    listActivitySourcesV1ActivitySourcesGetOptions({ client }),
  );
  const source = sources?.sources[0];
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTs = Math.floor(dayStart.getTime() / 1000);
  // Whole minutes keep the query key steady between clock ticks.
  const endTs = Math.floor(now.getTime() / 60_000) * 60;
  const { data } = useQuery({
    ...getActivitySummaryV1ActivitySummaryGetOptions({
      client,
      query: { start_ts: startTs, end_ts: endTs, source: source ?? "" },
    }),
    enabled: !!source,
  });
  return (
    <Block title="Screen time" page="activity" linkLabel="Screen time">
      <p className="text-13 text-white/80">{screenSentence(data ?? null)}</p>
    </Block>
  );
}

/** What's happening now and next, with each part one click from its page. */
export function TodayPage() {
  const now = useMinuteClock();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader title="Today" summary={format(now, "EEEE d MMMM")} />
      <NextUp now={now} />
      <TasksBlock now={now} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SleepBlock now={now} />
        <ScreenTimeBlock now={now} />
      </div>
    </div>
  );
}

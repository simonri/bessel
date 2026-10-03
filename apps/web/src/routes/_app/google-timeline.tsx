import {
  getLocationHistoryDayV1LocationHistoryDayGetOptions,
  getLocationHistorySummaryV1LocationHistorySummaryGetOptions,
  getLocationHistorySummaryV1LocationHistorySummaryGetQueryKey,
  importLocationHistoryV1LocationHistoryImportPostMutation,
  type LocationActivity,
  type LocationImportSchema,
  type LocationVisit,
} from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  ExternalLink,
  Loader2,
  MapPin,
  Route as RouteIcon,
  Upload,
} from "lucide-react";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { MapSelection } from "@/components/location-day-map";
import {
  EmptyState,
  PageToolbar,
  PeriodNav,
  SoftButton,
  StatTile,
} from "@/components/ui-kit";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";
import {
  activityInfo,
  adjacentDay,
  type DayEntry,
  dayEntries,
  dayOffset,
  dayParam,
  dayStats,
  formatDay,
  formatDistance,
  formatDuration,
  type IsoDay,
  isoDay,
  localTime,
  mapsUrl,
  utcOffsetLabel,
  visitSubtitle,
  visitTitle,
} from "./-google-timeline-utils";

export const Route = createFileRoute("/_app/google-timeline")({
  component: GoogleTimelinePage,
});

const LocationDayMap = lazy(() =>
  import("@/components/location-day-map").then((m) => ({
    default: m.LocationDayMap,
  })),
);

const DAY_QUERY_ID = "getLocationHistoryDayV1LocationHistoryDayGet";

function importSummary(result: LocationImportSchema): string {
  const changes = [
    result.added && `${result.added.toLocaleString()} added`,
    result.updated && `${result.updated.toLocaleString()} updated`,
    result.removed && `${result.removed.toLocaleString()} removed`,
    result.stale &&
      `${result.stale.toLocaleString()} skipped: a newer export already covers them`,
  ].filter(Boolean);
  return changes.length ? changes.join(", ") : "Already up to date";
}

function errorDetail(error: unknown): string {
  const detail = (error as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" ? detail : "The file couldn't be imported.";
}

function useTimelineImport(onImported: () => void) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useMutation({
    ...importLocationHistoryV1LocationHistoryImportPostMutation({ client }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: getLocationHistorySummaryV1LocationHistorySummaryGetQueryKey({
          client,
        }),
      });
      void queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as { _id?: string } | undefined)?._id ===
          DAY_QUERY_ID,
      });
      toast.success("Timeline imported", {
        description: importSummary(result),
      });
      onImported();
    },
    onError: (error) =>
      toast.error("Import failed", { description: errorDetail(error) }),
  });

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept=".json,application/json"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        mutation.mutate({
          client,
          body: { file },
          // When the phone wrote the file: tells a fresh export from an old one.
          query: { exported_at: new Date(file.lastModified) },
        });
      }}
    />
  );
  return {
    input,
    pick: () => inputRef.current?.click(),
    pending: mutation.isPending,
  };
}

function GoogleTimelinePage() {
  const { data: summary, isLoading } = useQuery(
    getLocationHistorySummaryV1LocationHistorySummaryGetOptions({ client }),
  );
  const days = useMemo(() => summary?.days.map(isoDay) ?? [], [summary]);
  const [picked, setPicked] = useState<IsoDay | null>(null);
  const day = picked ?? days.at(-1) ?? null;

  // After an import, show the newest day it brought.
  const upload = useTimelineImport(() => setPicked(null));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full bg-white/[0.06]" />
        <Skeleton className="h-96 w-full bg-white/[0.06]" />
      </div>
    );
  }

  const importButton = (
    <SoftButton onClick={upload.pick} disabled={upload.pending}>
      {upload.pending ? <Loader2 className="animate-spin" /> : <Upload />}
      {upload.pending ? "Importing…" : "Import"}
    </SoftButton>
  );

  if (!day) {
    return (
      <div className="space-y-4">
        {upload.input}
        <EmptyState icon={<RouteIcon />} title="No Google Timeline yet">
          <div className="mx-auto max-w-md space-y-3">
            <p>
              Google keeps Timeline on your phone. Export it there, then import
              the Timeline.json here. Importing again later only adds what's new
              or changed.
            </p>
            <ul className="space-y-1 text-left text-white/50">
              <li>
                <span className="text-white/70">iPhone:</span> Google Maps →
                your profile → Settings → Location & Privacy → Export Timeline
                data
              </li>
              <li>
                <span className="text-white/70">Android:</span> Settings →
                Location → Location services → Timeline → Export Timeline data
              </li>
            </ul>
            <div className="flex justify-center pt-1">{importButton}</div>
          </div>
        </EmptyState>
      </div>
    );
  }

  return (
    <TimelineDay
      day={day}
      days={days}
      onPick={setPicked}
      lastImport={summary?.last_import ?? null}
      importInput={upload.input}
      importButton={importButton}
    />
  );
}

function TimelineDay({
  day,
  days,
  onPick,
  lastImport,
  importInput,
  importButton,
}: {
  day: IsoDay;
  days: IsoDay[];
  onPick: (day: IsoDay) => void;
  lastImport: LocationImportSchema | null;
  importInput: React.ReactNode;
  importButton: React.ReactNode;
}) {
  const date = useMemo(() => dayParam(day), [day]);
  const { data, isFetching } = useQuery({
    ...getLocationHistoryDayV1LocationHistoryDayGetOptions({
      client,
      query: { date },
    }),
    placeholderData: keepPreviousData,
  });
  // Kept with its day, so moving to another day starts unselected.
  const [picked, setPicked] = useState<{ day: IsoDay; value: MapSelection }>({
    day,
    value: null,
  });
  const selection = picked.day === day ? picked.value : null;
  const setSelection = (value: MapSelection) => setPicked({ day, value });

  const visits = data?.visits ?? [];
  const activities = data?.activities ?? [];
  const entries = useMemo(
    () => dayEntries(data?.visits ?? [], data?.activities ?? []),
    [data],
  );
  const stats = dayStats(visits, activities, day);
  const offset = dayOffset(visits, activities);
  const viewerOffset = -date.getTimezoneOffset();
  const prev = adjacentDay(days, day, -1);
  const next = adjacentDay(days, day, 1);
  const latest = days.at(-1);

  return (
    <div className="@container flex min-h-0 flex-1 flex-col gap-4">
      {importInput}
      <PageToolbar
        description={
          lastImport
            ? `Imported ${formatDistanceToNow(lastImport.created_at, { addSuffix: true })} · ${days.length.toLocaleString()} days, ${formatDay(days[0], "medium")} – ${formatDay(latest ?? day, "medium")}`
            : "Your Google Maps Timeline."
        }
      >
        {importButton}
        {latest && day !== latest && (
          <SoftButton onClick={() => onPick(latest)}>Latest</SoftButton>
        )}
        <input
          type="date"
          aria-label="Go to date"
          value={day}
          min={days[0]}
          max={latest}
          onChange={(e) => e.target.value && onPick(e.target.value)}
          className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-12 text-white/75 outline-none [color-scheme:dark] focus:border-primary-500/50"
        />
        <PeriodNav
          label={formatDay(day)}
          onPrev={() => prev && onPick(prev)}
          onNext={() => next && onPick(next)}
          prevDisabled={!prev}
          nextDisabled={!next}
        />
      </PageToolbar>

      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        <StatTile label="Places" value={stats.places} />
        <StatTile label="Trips" value={stats.trips} />
        <StatTile
          label="Distance"
          value={stats.distance ? formatDistance(stats.distance) : "—"}
        />
        <StatTile
          label="Moving"
          value={stats.moving ? formatDuration(stats.moving) : "—"}
          hint={
            offset !== null && offset !== viewerOffset
              ? `Times in ${utcOffsetLabel(offset)}`
              : undefined
          }
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 @3xl:grid-cols-[minmax(18rem,24rem)_1fr]">
        <div
          className={cn(
            "min-h-0 overflow-y-auto rounded-xl border border-white/[0.07] bg-white/[0.03] p-1.5 transition-opacity @3xl:max-h-[38rem]",
            isFetching && "opacity-60",
          )}
        >
          {entries.length === 0 ? (
            <p className="px-3 py-8 text-center text-12 text-white/40">
              {data ? "Nothing recorded this day." : "Loading…"}
            </p>
          ) : (
            <ol>
              {entries.map((entry) => (
                <EntryRow
                  key={
                    entry.kind === "visit" ? entry.visit.id : entry.activity.id
                  }
                  entry={entry}
                  day={day}
                  selection={selection}
                  onSelect={setSelection}
                />
              ))}
            </ol>
          )}
        </div>
        <div className="h-80 min-h-0 overflow-hidden rounded-xl border border-white/[0.07] @3xl:h-auto @3xl:min-h-[24rem]">
          <Suspense
            fallback={<Skeleton className="h-full w-full bg-white/[0.04]" />}
          >
            <LocationDayMap
              visits={visits}
              activities={activities}
              path={data?.path ?? []}
              selection={selection}
              onSelect={setSelection}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  day,
  selection,
  onSelect,
}: {
  entry: DayEntry;
  day: IsoDay;
  selection: MapSelection;
  onSelect: (selection: MapSelection) => void;
}) {
  const id = entry.kind === "visit" ? entry.visit.id : entry.activity.id;
  const selected = selection?.kind === entry.kind && selection.id === id;
  const select = () => onSelect(selected ? null : { kind: entry.kind, id });

  return (
    <li>
      <button
        type="button"
        onClick={select}
        aria-pressed={selected}
        className={cn(
          "group flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-white/25",
          selected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
        )}
      >
        {entry.kind === "visit" ? (
          <VisitContent visit={entry.visit} nested={entry.children} day={day} />
        ) : (
          <ActivityContent activity={entry.activity} day={day} />
        )}
      </button>
    </li>
  );
}

function TimeRange({
  start,
  end,
  offset,
  day,
}: {
  start: Date;
  end: Date;
  offset: number | null;
  day: IsoDay;
}) {
  return (
    <span className="tabular-nums">
      {localTime(start, offset, day)} – {localTime(end, offset, day)}
    </span>
  );
}

function VisitContent({
  visit,
  nested,
  day,
}: {
  visit: LocationVisit;
  nested: LocationVisit[];
  day: IsoDay;
}) {
  const subtitle = visitSubtitle(visit);
  const url = mapsUrl(visit);
  return (
    <>
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-400/15 text-violet-300">
        <MapPin className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-13 font-medium",
              visit.name ? "text-white/90" : "text-white/60",
            )}
          >
            {visitTitle(visit)}
          </span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              title="Open in Google Maps"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 text-white/30 opacity-0 transition-opacity hover:text-white/70 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <ExternalLink className="size-3" />
            </a>
          )}
        </span>
        {subtitle && (
          <span className="block truncate text-11 text-white/40">
            {subtitle}
          </span>
        )}
        <span className="mt-0.5 block text-11 text-white/50">
          <TimeRange
            start={visit.start_at}
            end={visit.end_at}
            offset={visit.utc_offset_minutes}
            day={day}
          />
          <span className="text-white/30">
            {" · "}
            {formatDuration(visit.end_at.getTime() - visit.start_at.getTime())}
          </span>
        </span>
        {nested.length > 0 && (
          <span className="mt-1 block space-y-0.5 border-l border-white/10 pl-2">
            {nested.map((child) => (
              <span
                key={child.id}
                className="block truncate text-11 text-white/45"
              >
                {visitTitle(child)}{" "}
                <span className="text-white/30">
                  {localTime(child.start_at, child.utc_offset_minutes, day)}
                </span>
              </span>
            ))}
          </span>
        )}
      </span>
    </>
  );
}

function ActivityContent({
  activity,
  day,
}: {
  activity: LocationActivity;
  day: IsoDay;
}) {
  const { label, icon: Icon } = activityInfo(activity.activity_type);
  const details = [
    activity.distance_meters ? formatDistance(activity.distance_meters) : null,
    formatDuration(activity.end_at.getTime() - activity.start_at.getTime()),
  ].filter(Boolean);
  return (
    <>
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-400/10 text-sky-300">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-12 text-white/70">
          {label}
          <span className="text-white/40"> · {details.join(" · ")}</span>
        </span>
        <span className="block text-11 text-white/40">
          <TimeRange
            start={activity.start_at}
            end={activity.end_at}
            offset={activity.utc_offset_minutes}
            day={day}
          />
        </span>
      </span>
    </>
  );
}

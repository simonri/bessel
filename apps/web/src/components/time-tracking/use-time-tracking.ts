import {
  createTimeEntry,
  createTimeProject,
  deleteTimeEntry,
  getDailySleepOptions,
  getTimelineOptions,
  getTimeSummaryOptions,
  getTimeSummaryQueryKey,
  listTimeEntriesOptions,
  listTimeEntriesQueryKey,
  listTimeProjectsOptions,
  listTimeProjectsQueryKey,
  type TimeEntryCreate,
  type TimeEntrySchema,
  type TimeEntryUpdate,
  type TimeProjectCreate,
  type TimeProjectSchema,
  type TimeProjectUpdate,
  updateTimeEntry,
  updateTimeProject,
} from "@bessel/client";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { client } from "@/lib/client";
import { type SleepBand, sleepBands } from "./sleep-overlay";

const SLEEP_LOOKBACK_SECS = 60 * 86_400;
// The timeline serves at most a week at a time.
const MAX_SLEEP_WINDOW_SECS = 7 * 86_400;

/** Whether any sleep has come in lately, so the overlay is worth offering. */
export function useHasRecentSleep(timeZone: string): boolean {
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const { data } = useQuery(
    getDailySleepOptions({
      client,
      query: {
        start_ts: now - SLEEP_LOOKBACK_SECS,
        end_ts: now,
        tz_name: timeZone,
      },
    }),
  );
  return data?.nights.some((n) => n.asleep_secs > 0) ?? false;
}

/** Sleeps overlapping a range, as whole nights. */
export function useSleepBands(
  start: Date,
  end: Date,
  enabled: boolean,
): SleepBand[] {
  const startTs = Math.floor(start.getTime() / 1000);
  const endTs = Math.min(
    Math.ceil(end.getTime() / 1000),
    startTs + MAX_SLEEP_WINDOW_SECS,
  );
  const { data } = useQuery({
    ...getTimelineOptions({
      client,
      query: { start_ts: startTs, end_ts: endTs },
    }),
    enabled,
    placeholderData: keepPreviousData,
  });
  return useMemo(
    () =>
      sleepBands(data?.lanes.find((l) => l.key === "sleep")?.segments ?? []),
    [data],
  );
}

export function useTimeProjects(): TimeProjectSchema[] | undefined {
  return useQuery(listTimeProjectsOptions({ client })).data;
}

export function useTimeEntries(start: Date, end: Date) {
  return useQuery({
    ...listTimeEntriesOptions({
      client,
      query: { start, end },
    }),
    placeholderData: keepPreviousData,
  });
}

export function useTimeSummary(year: number, timeZone: string) {
  return useQuery({
    ...getTimeSummaryOptions({
      client,
      query: { year, tz_name: timeZone },
    }),
    placeholderData: keepPreviousData,
  });
}

// Keys without their query part partial-match every cached range and year.
function familyKey<T extends { query?: unknown }>(key: [T]) {
  const [{ query: _query, ...rest }] = key;
  return [rest];
}

const entriesFamily = familyKey(
  listTimeEntriesQueryKey({
    client,
    query: { start: new Date(0), end: new Date(0) },
  }),
);
const summaryFamily = familyKey(
  getTimeSummaryQueryKey({
    client,
    query: { year: 0, tz_name: "" },
  }),
);
const projectsKey = listTimeProjectsQueryKey({ client });

let tempIds = 0;

/** Entry and project writes. Entries change on screen at once and roll back
 *  if the server says no. */
export function useTimeWrites() {
  const queryClient = useQueryClient();

  const patchEntries = (
    update: (entries: TimeEntrySchema[]) => TimeEntrySchema[],
  ) =>
    queryClient.setQueriesData<TimeEntrySchema[]>(
      { queryKey: entriesFamily },
      (old) => (old ? update(old) : old),
    );

  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: entriesFamily });
    void queryClient.invalidateQueries({ queryKey: summaryFamily });
  };

  const optimistic = async <T>(
    change: (entries: TimeEntrySchema[]) => TimeEntrySchema[],
    request: () => Promise<T>,
    failure: string,
  ): Promise<T> => {
    await queryClient.cancelQueries({ queryKey: entriesFamily });
    const snapshot = queryClient.getQueriesData<TimeEntrySchema[]>({
      queryKey: entriesFamily,
    });
    patchEntries(change);
    try {
      return await request();
    } catch (error) {
      for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
      toast.error(failure);
      throw error;
    } finally {
      settle();
    }
  };

  const createEntry = (body: TimeEntryCreate) => {
    const now = new Date();
    const temp: TimeEntrySchema = {
      id: `temp-${++tempIds}`,
      time_project_id: body.time_project_id,
      start_ts: body.start_ts,
      end_ts: body.end_ts,
      note: body.note ?? null,
      created_at: now,
      modified_at: null,
    };
    return optimistic(
      (entries) => [...entries, temp],
      async () =>
        (
          await createTimeEntry({
            client,
            body,
            throwOnError: true,
          })
        ).data,
      "Couldn't save the entry",
    );
  };

  const updateEntry = (entry: TimeEntrySchema, body: TimeEntryUpdate) =>
    optimistic(
      (entries) =>
        entries.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                ...Object.fromEntries(
                  Object.entries(body).filter(([, v]) => v !== undefined),
                ),
              }
            : e,
        ),
      async () =>
        (
          await updateTimeEntry({
            client,
            path: { entry_id: entry.id },
            body,
            throwOnError: true,
          })
        ).data,
      "Couldn't update the entry",
    );

  const deleteEntry = (entry: TimeEntrySchema) =>
    optimistic(
      (entries) => entries.filter((e) => e.id !== entry.id),
      () =>
        deleteTimeEntry({
          client,
          path: { entry_id: entry.id },
          throwOnError: true,
        }),
      "Couldn't delete the entry",
    );

  const projectWrite = async <T>(
    request: () => Promise<T>,
    failure: string,
  ): Promise<T> => {
    try {
      return await request();
    } catch (error) {
      toast.error(failure);
      throw error;
    } finally {
      void queryClient.invalidateQueries({ queryKey: projectsKey });
    }
  };

  const createProject = (body: TimeProjectCreate) =>
    projectWrite(async () => {
      const { data } = await createTimeProject({
        client,
        body,
        throwOnError: true,
      });
      queryClient.setQueryData<TimeProjectSchema[]>(projectsKey, (old) =>
        old ? [...old, data] : [data],
      );
      return data;
    }, "Couldn't add the project");

  const updateProject = (project: TimeProjectSchema, body: TimeProjectUpdate) =>
    projectWrite(
      async () =>
        (
          await updateTimeProject({
            client,
            path: { project_id: project.id },
            body,
            throwOnError: true,
          })
        ).data,
      "Couldn't update the project",
    );

  return {
    createEntry,
    updateEntry,
    deleteEntry,
    createProject,
    updateProject,
  };
}

export type TimeWrites = ReturnType<typeof useTimeWrites>;

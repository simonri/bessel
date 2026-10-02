import { useAuth0 } from "@auth0/auth0-react";
import {
  getDailySleepV1HealthkitSleepDailyGet,
  getMeV1AuthMeGet,
} from "@bessel/client";
import { useEffect } from "react";
import { client } from "@/lib/client";

const isElectron = typeof window !== "undefined" && !!window.electron;

// Shape returned by the desktop app's local JSON server (apps/desktop's
// local-data-server.ts) for a third-party AI tool to read and analyze.
// Intentionally flat and self-describing — notes travel with the data
// rather than living only in this file, since the reader is an LLM with no
// access to this codebase.
interface LocalDataSnapshot {
  generated_at: string;
  timezone: string;
  window_days: number;
  user: { id: string; email: string | null };
  sleep: {
    notes: string;
    nights: Array<{
      date: string;
      asleep_hours: number;
      asleep_secs: number;
      sleep_onset: string | null;
      wake_time: string | null;
    }>;
  };
}

const SLEEP_NOTES =
  "Each night is keyed by the wake date (the day the sleeper woke up), not the bed date — nights run noon-to-noon in local time. " +
  "asleep_hours/asleep_secs exclude 'awake' and 'in bed' time. sleep_onset and wake_time mark the start and end of the night's " +
  "longest unbroken sleep episode (brief wakings don't count as a new bedtime); either may be null if no sleep was recorded that night.";

async function buildSnapshot(windowDays: number): Promise<LocalDataSnapshot> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const start = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const [me, daily] = await Promise.all([
    getMeV1AuthMeGet({ client }),
    getDailySleepV1HealthkitSleepDailyGet({
      client,
      query: {
        start_ts: Math.floor(start.getTime() / 1000),
        end_ts: Math.floor(now.getTime() / 1000),
        tz_name: timezone,
      },
    }),
  ]);

  if (!me.data) throw new Error("Failed to load user profile");
  if (!daily.data) throw new Error("Failed to load sleep data");

  return {
    generated_at: now.toISOString(),
    timezone,
    window_days: windowDays,
    user: { id: me.data.id, email: me.data.email ?? null },
    sleep: {
      notes: SLEEP_NOTES,
      nights: daily.data.nights.map((n) => ({
        date: n.date,
        asleep_hours: Math.round((n.asleep_secs / 3600) * 10) / 10,
        asleep_secs: n.asleep_secs,
        sleep_onset: n.sleep_onset ?? null,
        wake_time: n.wake_time ?? null,
      })),
    },
  };
}

// Answers the Electron main process's local JSON server (see apps/desktop's
// local-data-server.ts) — the main process has no Auth0 access token of its
// own (see cli-broker.ts's header comment for why), so every HTTP request
// to that server relays here over IPC and the response is built using this
// window's already-authenticated `client`.
export function LocalDataServerBridge() {
  const { isAuthenticated } = useAuth0();

  useEffect(() => {
    if (!isElectron) return;
    return window.electron!.localDataServer.onDataRequested(
      (requestId, windowDays) => {
        if (!isAuthenticated) {
          void window.electron!.localDataServer.provideData(requestId, null);
          return;
        }
        buildSnapshot(windowDays)
          .then((snapshot) =>
            window.electron!.localDataServer.provideData(requestId, snapshot),
          )
          .catch(() =>
            window.electron!.localDataServer.provideData(requestId, null),
          );
      },
    );
  }, [isAuthenticated]);

  return null;
}

import { addDays, format, startOfDay } from "date-fns";
import { useEffect, useMemo, useState } from "react";

/** The local calendar day of `date` as "yyyy-mm-dd". */
export function localIsoDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** A "yyyy-mm-dd" day as the API's `date` query params take it: a Date at
 *  UTC midnight, which the client serializes to exactly that day. */
export function apiDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** Milliseconds until the next local midnight after `now`. */
export function msUntilNextLocalDay(now: Date): number {
  return startOfDay(addDays(now, 1)).getTime() - now.getTime();
}

/** Today's local calendar day as "yyyy-mm-dd", updated when the day rolls over
 *  while the app stays open. */
export function useLocalDay(): string {
  const [day, setDay] = useState(() => localIsoDay(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      const now = new Date();
      setDay(localIsoDay(now));
      // Timers drift or stall across sleep, so the visibility check below
      // catches a rollover this one missed.
      timer = setTimeout(sync, msUntilNextLocalDay(now) + 1_000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return day;
}

/** Today as an API `date` param, stable until the local day changes. */
export function useApiToday(): Date {
  const day = useLocalDay();
  return useMemo(() => apiDate(day), [day]);
}

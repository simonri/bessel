import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { client } from "@/lib/client";
import { accountsQueryKey, refreshEvents } from "./use-calendar-data";

const CHANGES_URL = "/v1/calendars/changes";
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
/** Several calendars of one account often sync back to back. */
export const COALESCE_MS = 500;

/** Names of the events in a server-sent event stream; comments are skipped. */
export async function* readServerEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder
        .decode(value, { stream: true })
        .replaceAll("\r\n", "\n");
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const name = buffer
          .slice(0, end)
          .split("\n")
          .find((line) => line.startsWith("event:"))
          ?.slice("event:".length)
          .trim();
        if (name) yield name;
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function reconnectDelay(failures: number): number {
  return Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** failures);
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Follows the server's change stream until stopped, reconnecting with
 *  backoff, and refreshes calendar data on every (re)connect, since changes
 *  may have landed while no stream was open, and on every change. */
function streamChanges(queryClient: QueryClient): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      refreshEvents(queryClient);
      void queryClient.invalidateQueries({ queryKey: accountsQueryKey() });
    }, COALESCE_MS);
  };

  void (async () => {
    let failures = 0;
    while (!controller.signal.aborted) {
      try {
        const { response } = await client.get({
          url: CHANGES_URL,
          parseAs: "stream",
          signal: controller.signal,
        });
        if (response?.ok && response.body) {
          failures = 0;
          refresh();
          for await (const name of readServerEvents(response.body)) {
            if (name === "changed") refresh();
          }
        }
      } catch {
        // Dropped connection or network error; reconnect below.
      }
      if (controller.signal.aborted) return;
      await wait(reconnectDelay(failures++), controller.signal);
    }
  })();

  return () => {
    controller.abort();
    clearTimeout(timer);
  };
}

// One stream for the whole app, however many calendars are mounted.
let subscribers = 0;
let stopStream: (() => void) | null = null;

function subscribe(queryClient: QueryClient): () => void {
  subscribers += 1;
  stopStream ??= streamChanges(queryClient);
  return () => {
    subscribers -= 1;
    if (subscribers > 0) return;
    stopStream?.();
    stopStream = null;
  };
}

/** Refetches calendar data as soon as the server finishes a sync, e.g. after
 *  an event was added in Google Calendar or Notion. */
export function useCalendarChanges(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    return subscribe(queryClient);
  }, [enabled, queryClient]);
}

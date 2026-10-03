// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readServerEvents,
  reconnectDelay,
  useCalendarChanges,
} from "./use-calendar-changes";
import { isEventsQuery } from "./use-calendar-data";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client", () => ({
  client: { get, getConfig: () => ({ baseUrl: "" }) },
}));

afterEach(() => {
  get.mockReset();
});

const encoder = new TextEncoder();

/** A stream that delivers `chunks`, then stays open until `close()`. */
function controllableStream(chunks: string[]) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      for (const chunk of chunks) c.enqueue(encoder.encode(chunk));
    },
  });
  return {
    body,
    push: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
    close: () => controller.close(),
  };
}

function streamResponse(body: ReadableStream<Uint8Array>) {
  return { data: body, response: new Response(body, { status: 200 }) };
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const names: string[] = [];
  for await (const name of readServerEvents(stream)) names.push(name);
  return names;
}

describe("readServerEvents", () => {
  it("yields event names across chunk boundaries and skips comments", async () => {
    const stream = controllableStream([
      ": connected\n\n",
      "event: chan",
      "ged\ndata: {}\n",
      "\n: ping\n\nevent: changed\r\ndata: {}\r\n\r\n",
    ]);
    stream.close();
    expect(await collect(stream.body)).toEqual(["changed", "changed"]);
  });
});

describe("reconnectDelay", () => {
  it("backs off exponentially up to 30s", () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(reconnectDelay)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
    ]);
  });
});

describe("useCalendarChanges", () => {
  function setup(enabled = true) {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const hook = renderHook(({ on }) => useCalendarChanges(on), {
      wrapper,
      initialProps: { on: enabled },
    });
    const eventInvalidations = () =>
      invalidate.mock.calls.filter(([filters]) =>
        filters?.predicate?.({
          queryKey: [{ _id: "listCalendarEventsV1CalendarsEventsGet" }],
        } as never),
      ).length;
    return { hook, invalidate, eventInvalidations };
  }

  it("refetches once for a burst of changes", async () => {
    const stream = controllableStream([": connected\n\n"]);
    get.mockResolvedValueOnce(streamResponse(stream.body));
    const { invalidate, eventInvalidations } = setup();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get.mock.calls[0][0]).toMatchObject({
      url: "/v1/calendars/changes",
      parseAs: "stream",
    });
    stream.push("event: changed\ndata: {}\n\n");
    stream.push("event: changed\ndata: {}\n\n");

    await waitFor(() => expect(eventInvalidations()).toBe(1));
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(
      isEventsQuery([{ _id: "listCalendarEventsV1CalendarsEventsGet" }]),
    ).toBe(true);
  });

  it("reconnects after the stream drops and catches up on missed changes", async () => {
    const first = controllableStream([": connected\n\n"]);
    const second = controllableStream([": connected\n\n"]);
    get
      .mockResolvedValueOnce(streamResponse(first.body))
      .mockResolvedValueOnce(streamResponse(second.body));
    const { eventInvalidations } = setup();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(eventInvalidations()).toBe(0);

    first.close();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2), {
      timeout: 2_500,
    });
    await waitFor(() => expect(eventInvalidations()).toBe(1));
  });

  it("does nothing until enabled and aborts on unmount", async () => {
    const { hook } = setup(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(get).not.toHaveBeenCalled();

    get.mockResolvedValueOnce(
      streamResponse(controllableStream([": connected\n\n"]).body),
    );
    hook.rerender({ on: true });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    const signal = get.mock.calls[0][0].signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    hook.unmount();
    expect(signal.aborted).toBe(true);
  });
});

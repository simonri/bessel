import { describe, expect, it, vi } from "vitest";
import { toApiError } from "@/lib/api-error";
import { makeQueryClient } from "./react-query";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));
const captureException = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sentry", () => ({ captureException }));

const apiError = (status: number, detail?: string) =>
  toApiError(detail ? { detail } : {}, new Response(null, { status }));

async function runMutation(
  options: { onError?: () => void; meta?: Record<string, unknown> },
  error: unknown,
) {
  const queryClient = makeQueryClient();
  const mutation = queryClient.getMutationCache().build(queryClient, {
    ...options,
    mutationFn: () => Promise.reject(error),
  });
  await mutation.execute(undefined).catch(() => {});
}

describe("mutation errors", () => {
  it("toast the API's message when the mutation doesn't handle them", async () => {
    toastError.mockClear();
    await runMutation({}, apiError(409, "Name already taken"));
    expect(toastError).toHaveBeenCalledWith("Name already taken");
  });

  it("are left to mutations that handle them or opt out", async () => {
    toastError.mockClear();
    await runMutation({ onError: () => {} }, apiError(500));
    await runMutation({ meta: { errorToast: false } }, apiError(500));
    // Not from the API client, e.g. a desktop IPC call.
    await runMutation({}, new Error("EACCES"));
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("query errors", () => {
  async function failQuery(error: unknown) {
    const queryClient = makeQueryClient();
    await queryClient
      .fetchQuery({
        queryKey: ["thing"],
        queryFn: () => Promise.reject(error),
        retry: false,
      })
      .catch(() => {});
  }

  it("report server faults and rejected requests", async () => {
    captureException.mockClear();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await failQuery(apiError(500));
    await failQuery(apiError(422));
    expect(captureException).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it("don't report what the user or the network caused", async () => {
    captureException.mockClear();
    await failQuery(apiError(404));
    await failQuery(apiError(401));
    await failQuery(toApiError(new TypeError("Failed to fetch")));
    expect(captureException).not.toHaveBeenCalled();
  });
});

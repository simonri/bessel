// @vitest-environment jsdom
import { listTasksQueryKey, type TaskSchema } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { client } from "@/lib/client";
import { useTaskCacheHelpers } from "./use-task-cache";

const task = (id: string) => ({ id, title: id }) as unknown as TaskSchema;
const page = (ids: string[], total: number) => ({
  items: ids.map(task),
  pagination: { total_count: total },
});

describe("useTaskCacheHelpers.removeTask", () => {
  it("counts the task out only of the lists that hold it", () => {
    const queryClient = new QueryClient();
    const openKey = listTasksQueryKey({ client, query: { status: ["todo"] } });
    const doneKey = listTasksQueryKey({ client, query: { status: ["done"] } });
    queryClient.setQueryData(openKey, page(["a", "b"], 2));
    queryClient.setQueryData(doneKey, page(["c"], 7));
    const { result } = renderHook(() => useTaskCacheHelpers(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    result.current.removeTask("a");

    expect(queryClient.getQueryData(openKey)).toEqual(page(["b"], 1));
    expect(queryClient.getQueryData(doneKey)).toEqual(page(["c"], 7));
  });
});

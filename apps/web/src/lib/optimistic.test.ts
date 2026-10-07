import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  mutationFamily,
  restoreItemFields,
  settleWhenIdle,
} from "./optimistic";

type Row = { id: string; category: string | null; business: boolean };

const family = mutationFamily("rows");

function pending(queryClient: QueryClient) {
  let finish!: () => void;
  const result = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const mutation = queryClient.getMutationCache().build(queryClient, {
    ...family,
    mutationFn: () => result,
  });
  const done = mutation.execute(undefined);
  return async () => {
    finish();
    await done;
  };
}

describe("settleWhenIdle", () => {
  it("waits for the last write of the family before refetching", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.fn();
    const finishFirst = pending(queryClient);
    const finishSecond = pending(queryClient);

    // Called from the first write's onSettled, while it still counts.
    settleWhenIdle(queryClient, family.mutationKey, invalidate);
    expect(invalidate).not.toHaveBeenCalled();
    await finishFirst();

    settleWhenIdle(queryClient, family.mutationKey, invalidate);
    expect(invalidate).toHaveBeenCalledTimes(1);
    await finishSecond();
  });
});

describe("restoreItemFields", () => {
  it("undoes one mutation without touching other optimistic changes", () => {
    const queryClient = new QueryClient();
    const key = ["rows", { page: 1 }];
    const before: Row[] = [
      { id: "a", category: null, business: false },
      { id: "b", category: null, business: false },
    ];
    queryClient.setQueryData(key, { items: before, total: 2 });
    const snapshot = queryClient.getQueriesData({ queryKey: ["rows"] });

    // Two optimistic edits land; the first one then fails.
    queryClient.setQueryData(key, {
      items: [
        { id: "a", category: "food", business: true },
        { id: "b", category: "rent", business: false },
      ],
      total: 2,
    });
    restoreItemFields<Row>(queryClient, snapshot, new Set(["a"]), ["category"]);

    expect(queryClient.getQueryData(key)).toEqual({
      items: [
        { id: "a", category: null, business: true },
        { id: "b", category: "rent", business: false },
      ],
      total: 2,
    });
  });
});

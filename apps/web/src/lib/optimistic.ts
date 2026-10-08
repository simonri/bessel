import type { MutationKey, QueryClient, QueryKey } from "@tanstack/react-query";

type Page<T> = { items: T[] };
type Snapshot = [QueryKey, unknown][];

/** Mutation options for one family of writes (say, every transaction edit):
 *  the key lets a settling mutation see whether others are still in flight,
 *  and the scope sends their requests one at a time, in the order they were
 *  made. */
export function mutationFamily(name: string) {
  return { mutationKey: [name, "write"], scope: { id: name } };
}

/** onSettled for optimistic mutations: refetch only once the last mutation
 *  sharing `mutationKey` is done, so a refetch can't land between them and
 *  briefly undo a later one's optimistic change. */
export function settleWhenIdle(
  queryClient: QueryClient,
  mutationKey: MutationKey,
  invalidate: () => void,
) {
  // The settling mutation still counts as pending while its onSettled runs.
  if (queryClient.isMutating({ mutationKey }) <= 1) invalidate();
}

/** Puts back `fields` of the items in `ids` as they were in `previous` (a
 *  `getQueriesData` snapshot of paginated lists), leaving other items and
 *  fields as they are now — so undoing one failed mutation doesn't also undo
 *  other mutations' optimistic changes made since. */
export function restoreItemFields<T extends { id: string }>(
  queryClient: QueryClient,
  previous: Snapshot | undefined,
  ids: ReadonlySet<string>,
  fields: readonly (keyof T)[],
) {
  for (const [key, data] of previous ?? []) {
    const before = new Map(
      ((data as Page<T> | undefined)?.items ?? [])
        .filter((item) => ids.has(item.id))
        .map((item) => [item.id, item]),
    );
    if (before.size === 0) continue;
    queryClient.setQueryData<Page<T>>(key, (current) => {
      if (!current?.items) return current;
      return {
        ...current,
        items: current.items.map((item) => {
          const old = before.get(item.id);
          if (!old) return item;
          const restored = { ...item };
          for (const field of fields) restored[field] = old[field];
          return restored;
        }),
      };
    });
  }
}

import { useSyncExternalStore } from "react";
import type { PageKey } from "@/components/pages";

/** An item another part of the app wants a page to show, e.g. from search. */
export interface PageTarget {
  page: PageKey;
  id: string;
  /** For dated items (calendar events): an ISO instant or YYYY-MM-DD day. */
  at?: string;
}

let pending: PageTarget | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setPageTarget(target: PageTarget): void {
  pending = target;
  emit();
}

/** Marks the target handled so it isn't applied again. */
export function clearPageTarget(): void {
  if (pending === null) return;
  pending = null;
  emit();
}

/** The waiting target for `page`, if any. Apply it, then clearPageTarget(). */
export function usePageTarget(page: PageKey): PageTarget | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (pending?.page === page ? pending : null),
    () => null,
  );
}

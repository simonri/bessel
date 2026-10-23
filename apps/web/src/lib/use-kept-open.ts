import { useRef } from "react";

/**
 * The open item, kept when an edit takes it out of the list, such as a
 * transaction renamed under a search, so its panel stays open. Picking
 * another item, or none, lets it go.
 */
export function useKeptOpen<T extends { id: string }>(
  items: readonly T[],
  openId: string | null,
): T | null {
  const last = useRef<T | null>(null);
  const listed = items.find((item) => item.id === openId);
  if (listed) last.current = listed;
  return listed ?? (last.current?.id === openId ? last.current : null);
}

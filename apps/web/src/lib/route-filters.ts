import { useMatch, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";

/**
 * A page's filters: in the URL when the page is its own route, so links can
 * open it filtered; in local state when it's rendered elsewhere, such as a
 * canvas widget, where the URL belongs to another page.
 */
export function useRouteFilters<T extends object>(
  path: "/transactions",
): [T, (next: T) => void] {
  const match = useMatch({ from: `/_app${path}`, shouldThrow: false });
  const navigate = useNavigate();
  const [local, setLocal] = useState<T>({} as T);
  const onRoute = match !== undefined;
  const setFilters = useCallback(
    (next: T) => {
      if (onRoute)
        void navigate({ to: path, search: next as never, replace: true });
      else setLocal(next);
    },
    [onRoute, navigate, path],
  );
  return [onRoute ? (match.search as T) : local, setFilters];
}

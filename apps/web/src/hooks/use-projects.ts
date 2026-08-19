import {
  listProjectsV1ProjectsGetOptions,
  type ProjectSchema,
} from "@bessel/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { client } from "@/lib/client";

const CACHE_KEY = "bessel:projectsCache";

function loadCachedProjects(): ProjectSchema[] | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProjectSchema[]) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The project list, seeded from the last successful fetch so the sidebar's
 * project tree renders on the very first frame and survives the API being
 * unreachable — the canvas is local-first and its navigation must be too.
 * Every always-mounted consumer should go through this hook: initialData only
 * takes effect for whichever component creates the query first.
 */
export function useProjects() {
  const query = useQuery({
    ...listProjectsV1ProjectsGetOptions({ client }),
    initialData: loadCachedProjects,
    // Cached data is a placeholder, not a fresh result — refetch immediately.
    initialDataUpdatedAt: 0,
  });

  useEffect(() => {
    if (!query.isSuccess || query.isPlaceholderData) return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(query.data));
    } catch {}
  }, [query.isSuccess, query.isPlaceholderData, query.data]);

  return query;
}

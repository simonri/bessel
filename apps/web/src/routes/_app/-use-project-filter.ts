import { useCallback, useState } from "react";
import { userStorage } from "@/lib/user-storage";

export const PROJECT_FILTER_KEY = "bessel:tasks-project";

/**
 * The project the task list is filtered to. Pages unmount on every switch, so
 * it's kept in the user's storage and picked up again on the way back.
 */
export function useProjectFilter() {
  const [project, setProjectState] = useState(() =>
    userStorage.getItem(PROJECT_FILTER_KEY),
  );
  const setProject = useCallback((next: string | null) => {
    setProjectState(next);
    if (next) userStorage.setItem(PROJECT_FILTER_KEY, next);
    else userStorage.removeItem(PROJECT_FILTER_KEY);
  }, []);
  return [project, setProject] as const;
}

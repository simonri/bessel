import {
  createProjectMutation,
  listProjectsQueryKey,
  setProjectLocationMutation,
} from "@bessel/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/client";

export function useProjectMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: listProjectsQueryKey({ client }),
    });

  // Callers report failures per call, naming the project.
  const createProject = useMutation({
    ...createProjectMutation(),
    meta: { errorToast: false },
    onSuccess: invalidate,
  });
  const setLocation = useMutation({
    ...setProjectLocationMutation(),
    meta: { errorToast: false },
    onSuccess: invalidate,
  });

  return { createProject, setLocation };
}

export function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

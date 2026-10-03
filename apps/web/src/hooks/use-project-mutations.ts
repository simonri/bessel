import {
  createProjectV1ProjectsPostMutation,
  listProjectsV1ProjectsGetQueryKey,
  setProjectLocationV1ProjectsProjectIdLocationPutMutation,
} from "@bessel/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/client";

export function useProjectMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: listProjectsV1ProjectsGetQueryKey({ client }),
    });

  const createProject = useMutation({
    ...createProjectV1ProjectsPostMutation(),
    onSuccess: invalidate,
  });
  const setLocation = useMutation({
    ...setProjectLocationV1ProjectsProjectIdLocationPutMutation(),
    onSuccess: invalidate,
  });

  return { createProject, setLocation };
}

export function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

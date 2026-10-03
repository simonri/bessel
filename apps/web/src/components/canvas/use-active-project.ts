import {
  type ProjectWithPath,
  useProjectsWithPath,
} from "./project-picker-menu";
import { useWorkspaceMeta } from "./window-manager";

/** The project the session on screen belongs to, when it's set up on this device. */
export function useActiveProject(): ProjectWithPath | null {
  const projects = useProjectsWithPath();
  const { workspaces, activeWorkspaceId } = useWorkspaceMeta();
  const projectId = workspaces.find(
    (ws) => ws.id === activeWorkspaceId,
  )?.projectId;
  if (!projectId) return null;
  return projects.find((p) => p.id === projectId) ?? null;
}

export function projectWindowData(
  project: ProjectWithPath | null | undefined,
): Record<string, string> | undefined {
  if (!project) return undefined;
  return {
    projectPath: project.path,
    projectName: project.name,
    ...(project.ssh_host ? { projectSshHost: project.ssh_host } : {}),
  };
}

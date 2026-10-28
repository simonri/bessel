import { useCallback, useMemo } from "react";
import {
  useWindowActions,
  useWindowState,
  useWorkspaceMeta,
  type WindowEntry,
} from "@/components/canvas/window-manager";
import { useProjects } from "@/hooks/use-projects";
import type { ClaudeSessionView } from "./claude-sessions-types";
import { lastBoardOf } from "./session-boards";

export const CLAUDE_SESSION_KEY = "claudeSessionKey";

function sessionKeyOf(win: WindowEntry): string | undefined {
  return win.module === "claudeCode"
    ? win.data?.[CLAUDE_SESSION_KEY] || undefined
    : undefined;
}

/** Keys of the background sessions some window currently shows. */
export function useAttachedSessionKeys(): ReadonlySet<string> {
  const { windowsByWorkspace } = useWindowState();
  return useMemo(() => {
    const keys = new Set<string>();
    for (const windows of windowsByWorkspace.values())
      for (const win of windows) {
        const key = sessionKeyOf(win);
        if (key) keys.add(key);
      }
    return keys;
  }, [windowsByWorkspace]);
}

/**
 * Shows a Claude session: switches to the canvas session that already has it
 * open, else reopens it in the canvas session it was last shown in, else in a
 * new one under its project.
 */
export function useOpenClaudeSession(onShowCanvas: () => void) {
  const { windowsByWorkspace } = useWindowState();
  const { workspaces } = useWorkspaceMeta();
  const { createSession, switchWorkspace, openWindow } = useWindowActions();
  const { data: projects } = useProjects();

  return useCallback(
    (session: ClaudeSessionView) => {
      for (const [workspaceId, windows] of windowsByWorkspace) {
        if (windows.some((w) => sessionKeyOf(w) === session.key)) {
          switchWorkspace(workspaceId);
          onShowCanvas();
          return;
        }
      }
      const project =
        projects?.find((p) => p.id === session.projectId) ??
        projects?.find((p) => p.path === session.cwd && !p.ssh_host);
      const data = {
        [CLAUDE_SESSION_KEY]: session.key,
        projectPath: session.cwd,
        ...(project ? { projectName: project.name } : {}),
      };
      const board = lastBoardOf(session.key);
      if (board && workspaces.some((ws) => ws.id === board)) {
        switchWorkspace(board);
        if (openWindow("claudeCode", data)) {
          onShowCanvas();
          return;
        }
      }
      createSession({
        projectId: project?.id,
        name: session.name,
        closeWhenEmpty: true,
        specs: [{ module: "claudeCode", data }],
      });
      onShowCanvas();
    },
    [
      windowsByWorkspace,
      workspaces,
      projects,
      createSession,
      switchWorkspace,
      openWindow,
      onShowCanvas,
    ],
  );
}

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getClaudeSessionsSnapshot, isLive } from "./claude-sessions-store";
import { useShowCanvas } from "./show-canvas-context";
import { endClaudeSession } from "./use-end-session";
import {
  useAttachedSessionKeys,
  useOpenClaudeSession,
} from "./use-open-claude-session";

// Long enough for one status poll: a window that closed because its session
// ended (/exit, or from the phone) shouldn't claim the session still runs.
const DETACH_CHECK_MS = 2_500;

function useOpenRequests() {
  const open = useOpenClaudeSession(useShowCanvas());
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(
    () =>
      window.electron?.claudeSessions.onOpenRequested((key) => {
        const session = getClaudeSessionsSnapshot().sessions.find(
          (s) => s.key === key,
        );
        if (session) openRef.current(session);
      }),
    [],
  );
}

/** Closing a session's window only detaches it — say so, with a way out. */
function useDetachNotice() {
  const attached = useAttachedSessionKeys();
  const previous = useRef<ReadonlySet<string> | null>(null);
  const current = useRef(attached);
  const detached = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    current.current = attached;
    const before = previous.current;
    previous.current = attached;
    if (!before) return;
    for (const key of before) if (!attached.has(key)) detached.current.add(key);
    if (detached.current.size === 0) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const keys = detached.current;
      detached.current = new Set();
      const running = getClaudeSessionsSnapshot().sessions.filter(
        (s) =>
          keys.has(s.key) && isLive(s.status) && !current.current.has(s.key),
      );
      if (running.length === 0) return;
      const [first] = running;
      toast(
        running.length === 1
          ? `“${first.name}” is still running`
          : `${running.length} Claude sessions are still running`,
        {
          description:
            "In the background. Reopen from the sidebar, or continue on your phone.",
          action: {
            label: running.length === 1 ? "End session" : "End all",
            onClick: () => {
              for (const s of running) endClaudeSession(s.key);
            },
          },
        },
      );
    }, DETACH_CHECK_MS);
  }, [attached]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}

export function ClaudeSessionsBridge() {
  useOpenRequests();
  useDetachNotice();
  return null;
}

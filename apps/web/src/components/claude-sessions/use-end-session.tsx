import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@bessel/ui/components/alert-dialog";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { claudeSessionsApi } from "./claude-sessions-store";
import type { ClaudeSessionView } from "./claude-sessions-types";

export function endClaudeSession(key: string): void {
  claudeSessionsApi()
    .end(key)
    .catch(() => toast.error("Couldn't end the session"));
}

/**
 * Ends a session, asking first only when that would interrupt Claude
 * mid-task. Render `endDialog` once wherever the hook is used.
 */
export function useEndClaudeSession() {
  const [pending, setPending] = useState<ClaudeSessionView | null>(null);

  const requestEnd = useCallback((session: ClaudeSessionView) => {
    if (session.status === "working") setPending(session);
    else endClaudeSession(session.key);
  }, []);

  const endDialog = (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => !open && setPending(null)}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>End “{pending?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Claude is still working on it. The conversation is kept, so you can
            resume it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (pending) endClaudeSession(pending.key);
              setPending(null);
            }}
          >
            End session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestEnd, endDialog };
}

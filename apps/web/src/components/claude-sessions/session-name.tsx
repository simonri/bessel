import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { claudeSessionsApi } from "./claude-sessions-store";
import type { ClaudeSessionView } from "./claude-sessions-types";

/**
 * A background session's name in a window's title bar: double-click (or the
 * window menu) swaps it for an input. `onRenamed` gets the name the desktop
 * settled on, which may carry a suffix to stay unique.
 */
export function SessionName({
  session,
  editing,
  onEditingChange,
  onRenamed,
}: {
  session: ClaudeSessionView;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onRenamed?: (name: string, previous: string) => void;
}) {
  if (!editing) {
    return (
      <span
        title="Double-click to rename"
        onDoubleClick={() => onEditingChange(true)}
      >
        {session.name}
      </span>
    );
  }
  return (
    <SessionNameInput
      session={session}
      onDone={() => onEditingChange(false)}
      onRenamed={onRenamed}
    />
  );
}

function SessionNameInput({
  session,
  onDone,
  onRenamed,
}: {
  session: ClaudeSessionView;
  onDone: () => void;
  onRenamed?: (name: string, previous: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape blurs the input too; this keeps that blur from committing.
  const cancelledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = (value: string) => {
    onDone();
    const name = value.trim();
    if (cancelledRef.current || !name || name === session.name) return;
    const previous = session.name;
    claudeSessionsApi()
      .rename(session.key, name)
      .then((view) => onRenamed?.(view.name, previous))
      .catch(() => toast.error("Couldn't rename the session"));
  };

  return (
    <input
      ref={inputRef}
      defaultValue={session.name}
      aria-label="Session name"
      // The title bar is the window's drag handle.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          cancelledRef.current = true;
          e.currentTarget.blur();
        }
      }}
      className="h-5 w-48 max-w-full rounded border border-white/15 bg-black/30 px-1 font-normal text-xs text-white/90 outline-none focus:border-primary-500/50"
    />
  );
}

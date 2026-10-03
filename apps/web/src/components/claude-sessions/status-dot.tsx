import type { AgentStatus } from "@/components/canvas/window-manager";
import { cn } from "@/lib/utils";

export const STATUS_DOT_TITLE: Record<AgentStatus, string> = {
  working: "Working",
  waiting: "Needs you",
  free: "Idle",
};

/** The one status vocabulary for agent sessions, everywhere they're shown. */
export function StatusDot({
  status,
  className,
}: {
  status: AgentStatus | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full transition-colors duration-300",
        status === "working" && "animate-pulse bg-amber-400",
        status === "waiting" && "bg-sky-400",
        status === "free" && "bg-emerald-400",
        status === null && "bg-white/20",
        className,
      )}
    />
  );
}

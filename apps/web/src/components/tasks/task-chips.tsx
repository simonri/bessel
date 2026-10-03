import { Calendar, Flag, Repeat } from "lucide-react";
import { type DueTone, describeDue, PRIORITY_CONFIG } from "@/lib/task-format";
import { cn } from "@/lib/utils";
import { projectChipStyle } from "./project-colors";

const CHIP =
  "inline-flex h-5 items-center gap-1 rounded-full px-2 text-11 font-medium";

const DUE_TONE: Record<DueTone, string> = {
  overdue: "bg-rose-500/15 text-rose-300",
  today: "bg-primary-500/15 text-primary-300",
  upcoming: "bg-white/[0.06] text-white/55",
};

export function DuePill({ due }: { due: Date | string | null | undefined }) {
  const info = describeDue(due);
  if (!info) return null;
  return (
    <span className={cn(CHIP, DUE_TONE[info.tone])}>
      <Calendar className="size-3" />
      {info.label}
    </span>
  );
}

export function ProjectChip({ name }: { name: string }) {
  return (
    <span className={CHIP} style={projectChipStyle(name)}>
      {name}
    </span>
  );
}

export function RecurrenceChip({ label }: { label: string }) {
  return (
    <span className={cn(CHIP, "bg-white/[0.06] text-white/55")}>
      <Repeat className="size-3" />
      {label}
    </span>
  );
}

export function PriorityFlag({ priority }: { priority: number }) {
  if (priority < 3) return null;
  const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[0];
  return (
    <Flag
      aria-label={`${config.label} priority`}
      className={cn("size-3 fill-current", config.color)}
    />
  );
}

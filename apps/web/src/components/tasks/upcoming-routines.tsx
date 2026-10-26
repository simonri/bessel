import type { TaskSchema } from "@bessel/client";
import { ChevronRight, Repeat } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { TaskRow } from "./task-row";

/** Routines that aren't due yet, folded away at the bottom of the list; each joins Today on its day. */
export function UpcomingRoutines({
  routines,
  onSelectTask,
  onCompleteTask,
  draggableToClaude = false,
}: {
  routines: TaskSchema[];
  onSelectTask: (task: TaskSchema) => void;
  onCompleteTask: (task: TaskSchema) => void;
  draggableToClaude?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (routines.length === 0) return null;
  return (
    <section aria-label="Routines coming up">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="mb-1 flex h-8 w-full items-center gap-2 rounded-lg bg-white/[0.035] px-2.5 text-left transition-colors duration-150 hover:bg-white/[0.06]"
      >
        <Repeat className="size-4 shrink-0 text-white/40" />
        <span className="text-13 font-medium text-white/70">
          Routines coming up
        </span>
        <span className="text-12 tabular-nums text-white/40">
          {routines.length}
        </span>
        <ChevronRight
          className={cn(
            "ml-auto size-3.5 text-white/35 transition-transform duration-150",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <div className="flex flex-col">
          {routines.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onSelect={() => onSelectTask(task)}
              onComplete={() => onCompleteTask(task)}
              draggableToClaude={draggableToClaude}
            />
          ))}
        </div>
      )}
    </section>
  );
}

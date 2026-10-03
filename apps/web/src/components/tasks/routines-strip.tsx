import type { TaskSchema } from "@bessel/client";
import { Repeat } from "lucide-react";
import {
  formatRecurrence,
  isDoneStatus,
  isRepeatingTask,
} from "@/lib/task-format";
import { cn } from "@/lib/utils";
import { CompleteCheck } from "./complete-check";
import { useDelayedComplete } from "./use-delayed-complete";

function RoutineChip({
  task,
  onSelect,
  onComplete,
}: {
  task: TaskSchema;
  onSelect: () => void;
  onComplete: () => void;
}) {
  const { phase, complete } = useDelayedComplete(onComplete);
  const recurrence = formatRecurrence(task);
  return (
    <div
      className={cn(
        "flex h-7 max-w-full items-center gap-1.5 rounded-full bg-white/[0.04] pr-3 pl-1.5 ring-1 ring-white/[0.06] transition-[background-color,opacity] duration-200 hover:bg-white/[0.07]",
        phase === "leaving" && "pointer-events-none opacity-0",
      )}
    >
      <CompleteCheck
        checked={phase !== "idle"}
        onToggle={complete}
        label={`Complete ${task.title}`}
        className="size-3.5 [&_svg]:size-2.5"
      />
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 items-center gap-1.5 text-left text-xs outline-none"
      >
        <span
          className={cn(
            "truncate",
            phase !== "idle" ? "text-white/40 line-through" : "text-white/80",
          )}
        >
          {task.title}
        </span>
        {recurrence && (
          <span className="shrink-0 text-white/40">{recurrence}</span>
        )}
      </button>
    </div>
  );
}

/** Recurring tasks as small chips you can tick off in place. */
export function RoutinesStrip({
  tasks,
  onSelectTask,
  onCompleteTask,
}: {
  tasks: TaskSchema[];
  onSelectTask: (task: TaskSchema) => void;
  onCompleteTask: (task: TaskSchema) => void;
}) {
  const routines = tasks.filter(
    (t) => isRepeatingTask(t) && !isDoneStatus(t.status),
  );
  if (routines.length === 0) return null;
  return (
    <section aria-label="Routines" className="flex flex-col gap-2 pb-4">
      <div className="flex items-center gap-1.5 px-2.5 text-11 font-semibold text-white/45">
        <Repeat className="size-3" />
        Routines
      </div>
      <div className="flex flex-wrap gap-1.5 px-1">
        {routines.map((task) => (
          <RoutineChip
            key={task.id}
            task={task}
            onSelect={() => onSelectTask(task)}
            onComplete={() => onCompleteTask(task)}
          />
        ))}
      </div>
    </section>
  );
}

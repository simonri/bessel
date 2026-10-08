import type { TaskSchema } from "@bessel/client";
import { RotateCcw } from "lucide-react";
import {
  buildTaskPrompt,
  formatRecurrence,
  isDoneStatus,
} from "@/lib/task-format";
import { cn } from "@/lib/utils";
import { CompleteCheck } from "./complete-check";
import {
  DuePill,
  PriorityFlag,
  ProjectChip,
  RecurrenceChip,
} from "./task-chips";
import { SelectBox, useTaskSelection } from "./task-selection";
import { useDelayedComplete } from "./use-delayed-complete";

export function TaskMeta({ task }: { task: TaskSchema }) {
  const recurrence = formatRecurrence(task);
  const hasMeta =
    task.due_date || recurrence || task.project || (task.priority ?? 0) >= 3;
  if (!hasMeta) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <PriorityFlag priority={task.priority ?? 0} />
      <DuePill due={task.due_date} />
      {recurrence && <RecurrenceChip label={recurrence} />}
      {task.project && <ProjectChip name={task.project} />}
    </div>
  );
}

/** One task in a list: light, rounded, and satisfying to tick off. */
export function TaskRow({
  task,
  onSelect,
  onComplete,
  onReopen,
  draggableToClaude = false,
}: {
  task: TaskSchema;
  onSelect: () => void;
  onComplete: () => void;
  onReopen?: () => void;
  draggableToClaude?: boolean;
}) {
  const done = isDoneStatus(task.status);
  const { phase, complete } = useDelayedComplete(onComplete);
  const checked = done || phase !== "idle";
  const selection = useTaskSelection();
  const selecting = selection !== null && !done;
  const picked = selecting && selection.selected.has(task.id);
  const activate = selecting ? () => selection.toggle(task.id) : onSelect;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a row holding its own checkbox button can't itself be a <button>
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selecting ? picked : undefined}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || (selecting && e.key === " ")) {
          e.preventDefault();
          activate();
        }
      }}
      draggable={draggableToClaude && !selecting}
      onDragStart={
        draggableToClaude
          ? (e) => {
              e.dataTransfer.setData(
                "bessel/task-prompt",
                buildTaskPrompt(task),
              );
              e.dataTransfer.setData("bessel/task-id", task.id);
              e.dataTransfer.effectAllowed = "copy";
            }
          : undefined
      }
      className={cn(
        "group flex cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2 outline-none transition-[background-color,opacity,transform] duration-200 ease-out hover:bg-white/[0.05] focus-visible:bg-white/[0.06]",
        phase === "leaving" && "pointer-events-none -translate-x-1 opacity-0",
        picked && "bg-primary-500/[0.08] hover:bg-primary-500/[0.12]",
      )}
    >
      {selecting ? (
        <SelectBox checked={picked} className="mt-px" />
      ) : done && onReopen ? (
        <button
          type="button"
          aria-label="Reopen"
          title="Reopen"
          onClick={(e) => {
            e.stopPropagation();
            onReopen();
          }}
          className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/45 transition-colors hover:bg-white/15 hover:text-white/80"
        >
          <RotateCcw className="size-3" />
        </button>
      ) : (
        <CompleteCheck
          checked={checked}
          onToggle={complete}
          label={`Complete ${task.title}`}
          className="mt-px"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={cn(
            "text-13 leading-snug transition-colors duration-300",
            checked
              ? "text-white/40 line-through decoration-white/30"
              : "text-white/85",
          )}
        >
          {task.title}
        </span>
        <TaskMeta task={task} />
      </div>
    </div>
  );
}

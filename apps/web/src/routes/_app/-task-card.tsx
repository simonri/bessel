import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TaskSchema } from "@bessel/client";
import { Calendar, Circle, CircleCheck, Flag, Repeat } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  formatDueDate,
  formatRecurrence,
  getDueDateColor,
  PRIORITY_CONFIG,
} from "@/lib/task-format";

function TaskCardMeta({ task }: { task: TaskSchema }) {
  const priority = task.priority ?? 0;
  const priorityConfig = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[0];
  const dueLabel = formatDueDate(task.due_date);
  const dueColor = getDueDateColor(task.due_date);
  const recurrence = formatRecurrence(task);

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="text-13 font-medium text-white/85 leading-snug">
        {task.title}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {dueLabel && (
          <span className={`flex items-center gap-1 text-11 ${dueColor}`}>
            <Calendar className="size-3" />
            {dueLabel}
          </span>
        )}
        {recurrence && (
          <span className="flex items-center gap-1 text-11 text-white/50">
            <Repeat className="size-3" />
            {recurrence}
          </span>
        )}
        {priority >= 3 && <Flag className={`size-3 ${priorityConfig.color}`} />}
        {task.project && (
          <span className="text-11 text-white/50 bg-white/10 rounded px-1.5 py-0">
            {task.project}
          </span>
        )}
        {task.area && (
          <span className="text-11 text-white/50">{task.area}</span>
        )}
      </div>
    </div>
  );
}

export function TaskCard({
  task,
  onSelect,
  onComplete,
}: {
  task: TaskSchema;
  onSelect: () => void;
  onComplete: () => void;
}) {
  const priority = task.priority ?? 0;
  const priorityConfig = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[0];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { task },
  });

  const [isCompleting, setIsCompleting] = useState(false);
  const completeTimer = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // If the card unmounts while the exit is playing (filter change, refetch),
  // still deliver the completion — never lose the click.
  useEffect(
    () => () => {
      if (completeTimer.current != null) {
        window.clearTimeout(completeTimer.current);
        onCompleteRef.current();
      }
    },
    [],
  );

  const handleComplete = () => {
    if (isCompleting) return;
    setIsCompleting(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onComplete();
      return;
    }
    completeTimer.current = window.setTimeout(() => {
      completeTimer.current = null;
      onComplete();
    }, 180);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-lg border border-white/10 bg-white/5 p-2.5 transition-[background-color,border-color] duration-150 cursor-grab active:cursor-grabbing pointer-fine:hover:bg-white/10 pointer-fine:hover:border-white/20 last:mb-3 ${priorityConfig.border} ${isDragging ? "opacity-30" : ""} ${isCompleting ? "pointer-events-none opacity-0 scale-[0.98] transition-[opacity,transform] duration-[180ms] ease-out" : ""}`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          className="mt-0.5 shrink-0 text-white/25 pointer-fine:hover:text-emerald-400 transition-[color,transform] duration-150 active:scale-90 motion-reduce:active:scale-100"
          onClick={(e) => {
            e.stopPropagation();
            handleComplete();
          }}
        >
          {isCompleting ? (
            <CircleCheck className="size-4 text-emerald-400" />
          ) : (
            <Circle className="size-4" />
          )}
        </button>
        <TaskCardMeta task={task} />
      </div>
    </div>
  );
}

export function DragCard({ task }: { task: TaskSchema }) {
  const priority = task.priority ?? 0;
  const priorityConfig = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[0];

  return (
    <div
      className={`rounded-lg border border-white/25 bg-white/10 p-2.5 shadow-2xl cursor-grabbing ${priorityConfig.border}`}
    >
      <div className="flex items-start gap-2.5">
        <Circle className="size-4 mt-0.5 shrink-0 text-white/25" />
        <TaskCardMeta task={task} />
      </div>
    </div>
  );
}

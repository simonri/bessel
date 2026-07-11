import type { TaskSchema } from "@bessel/client";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { Calendar, Circle, Flag, Repeat } from "lucide-react";
import {
  formatDueDate,
  formatRecurrence,
  getDueDateColor,
  PRIORITY_CONFIG,
} from "@/lib/task-format";

export function ScheduledTasksDialog({
  tasks,
  onSelectTask,
  onCompleteTask,
}: {
  tasks: TaskSchema[];
  onSelectTask: (task: TaskSchema) => void;
  onCompleteTask: (task: TaskSchema) => void;
}) {
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Repeat className="size-4 text-violet-400" />
          Repeated
        </DialogTitle>
        <DialogDescription className="sr-only">
          Recurring tasks
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
        {tasks.length === 0 ? (
          <div className="text-center text-xs text-white/50 py-8">
            No repeated tasks.
          </div>
        ) : (
          tasks.map((task) => {
            const priority = task.priority ?? 0;
            const priorityConfig =
              PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[0];
            const dueLabel = formatDueDate(task.due_date);
            const dueColor = getDueDateColor(task.due_date);
            const recurrence = formatRecurrence(task);
            return (
              <div
                key={task.id}
                className={`rounded-lg border border-white/10 bg-white/5 p-2.5 cursor-pointer hover:bg-white/10 hover:border-white/20 transition-colors ${priorityConfig.border}`}
                onClick={() => onSelectTask(task)}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-white/25 hover:text-emerald-400 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompleteTask(task);
                    }}
                  >
                    <Circle className="size-4" />
                  </button>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-13 font-medium text-white/85 leading-snug">
                      {task.title}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {dueLabel && (
                        <span
                          className={`flex items-center gap-1 text-11 ${dueColor}`}
                        >
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
                      {priority >= 3 && (
                        <Flag className={`size-3 ${priorityConfig.color}`} />
                      )}
                      {task.project && (
                        <span className="text-11 text-white/50 bg-white/10 rounded px-1.5 py-0">
                          {task.project}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </DialogContent>
  );
}

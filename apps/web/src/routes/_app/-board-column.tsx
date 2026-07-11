import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { TaskSchema } from "@bessel/client";
import { STATUS_CONFIG } from "@/lib/task-format";
import { TaskCard } from "./-task-card";

export function BoardColumn({
  status,
  tasks,
  onSelectTask,
  onCompleteTask,
}: {
  status: string;
  tasks: TaskSchema[];
  onSelectTask: (task: TaskSchema) => void;
  onCompleteTask: (task: TaskSchema) => void;
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.todo;
  const Icon = config.icon;
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-0 flex flex-col min-h-0 rounded-lg transition-colors ${isOver ? "bg-white/5" : ""}`}
    >
      <div className="flex items-center gap-2 mb-3 px-1 shrink-0">
        <Icon className={`size-3.5 ${config.color}`} />
        <span className="text-11 font-semibold text-white/50">
          {config.label}
        </span>
        <span className="text-10 text-white/50 bg-white/10 rounded-full px-1.5 tabular-nums ml-0.5">
          {tasks.length}
        </span>
      </div>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 overflow-y-auto space-y-1.5 px-1 pt-1">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onSelect={() => onSelectTask(task)}
              onComplete={() => onCompleteTask(task)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-11 text-white/50">
              No tasks
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

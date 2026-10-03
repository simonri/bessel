import type { TaskSchema } from "@bessel/client";
import { cn } from "@/lib/utils";
import { TaskRow } from "./task-row";
import { groupTasksByWhen, type WhenGroup } from "./today-groups";

function GroupHeader({ group }: { group: WhenGroup }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 pb-1 text-11 font-semibold",
        group.key === "overdue" ? "text-rose-300/80" : "text-white/45",
      )}
    >
      {group.key === "doing" && (
        <span
          aria-hidden
          className="size-1.5 animate-pulse rounded-full bg-primary-400"
        />
      )}
      {group.label}
      <span className="font-medium tabular-nums text-white/30">
        {group.tasks.length}
      </span>
    </div>
  );
}

/** Open tasks by when they matter: what you're doing, then by due date. */
export function TodayView({
  tasks,
  onSelectTask,
  onCompleteTask,
  draggableToClaude = false,
}: {
  tasks: TaskSchema[];
  onSelectTask: (task: TaskSchema) => void;
  onCompleteTask: (task: TaskSchema) => void;
  draggableToClaude?: boolean;
}) {
  const groups = groupTasksByWhen(tasks);

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
        <p className="text-sm font-medium text-white/80">All clear ✨</p>
        <p className="text-xs text-white/45">
          Enjoy your day. New tasks show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-3">
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <GroupHeader group={group} />
            <div className="flex flex-col">
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onSelect={() => onSelectTask(task)}
                  onComplete={() => onCompleteTask(task)}
                  draggableToClaude={draggableToClaude}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

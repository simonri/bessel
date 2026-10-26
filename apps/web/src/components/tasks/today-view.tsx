import type { TaskSchema } from "@bessel/client";
import { cn } from "@/lib/utils";
import { TaskRow } from "./task-row";
import {
  groupTasksByWhen,
  upcomingRoutines,
  type WhenGroup,
} from "./today-groups";
import { UpcomingRoutines } from "./upcoming-routines";
import { WHEN_STYLE } from "./when-icon";

function GroupHeader({ group }: { group: WhenGroup }) {
  const style = WHEN_STYLE[group.key];
  return (
    <div
      className={cn(
        "mb-1 flex h-8 items-center gap-2 rounded-lg px-2.5",
        style.band,
      )}
    >
      <span className={cn("flex shrink-0", style.color)}>{style.icon}</span>
      <span className="text-13 font-medium text-white/85">{group.label}</span>
      <span className="text-12 tabular-nums text-white/40">
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
  const upcoming = (
    <UpcomingRoutines
      routines={upcomingRoutines(tasks)}
      onSelectTask={onSelectTask}
      onCompleteTask={onCompleteTask}
      draggableToClaude={draggableToClaude}
    />
  );

  if (groups.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
          <p className="text-13 font-medium text-white/80">All clear ✨</p>
          <p className="text-12 text-white/45">
            Enjoy your day. New tasks show up here.
          </p>
        </div>
        {upcoming}
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
        {upcoming}
      </div>
    </div>
  );
}

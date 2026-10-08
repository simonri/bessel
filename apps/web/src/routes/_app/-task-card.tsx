import type { TaskSchema } from "@bessel/client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CompleteCheck } from "@/components/tasks/complete-check";
import { TaskMeta } from "@/components/tasks/task-row";
import { SelectBox, useTaskSelection } from "@/components/tasks/task-selection";
import { useDelayedComplete } from "@/components/tasks/use-delayed-complete";
import { cn } from "@/lib/utils";

const CARD =
  "rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.06] transition-[background-color,box-shadow,opacity,transform] duration-200 ease-out";

function CardBody({
  task,
  check,
}: {
  task: TaskSchema;
  check: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {check}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-13 leading-snug text-white/85">{task.title}</span>
        <TaskMeta task={task} />
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });
  const { phase, complete } = useDelayedComplete(onComplete);
  const selection = useTaskSelection();
  const picked = selection?.selected.has(task.id) ?? false;

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: dnd-kit's attributes make this a role="button"
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      // No dragging while picking tasks: a press is a toggle.
      {...(selection ? {} : listeners)}
      aria-pressed={selection ? picked : undefined}
      onClick={selection ? () => selection.toggle(task.id) : onSelect}
      className={cn(
        CARD,
        "cursor-grab last:mb-3 active:cursor-grabbing pointer-fine:hover:bg-white/[0.07] pointer-fine:hover:ring-white/10",
        isDragging && "opacity-30",
        selection && "cursor-pointer active:cursor-pointer",
        picked && "bg-primary-500/[0.1] ring-primary-400/40",
        phase === "leaving" && "pointer-events-none scale-[0.98] opacity-0",
      )}
    >
      <CardBody
        task={task}
        check={
          selection ? (
            <SelectBox checked={picked} className="mt-px" />
          ) : (
            <CompleteCheck
              checked={phase !== "idle"}
              onToggle={complete}
              label={`Complete ${task.title}`}
              className="mt-px"
            />
          )
        }
      />
    </div>
  );
}

export function DragCard({ task }: { task: TaskSchema }) {
  return (
    <div
      className={cn(
        CARD,
        "cursor-grabbing bg-white/[0.09] shadow-2xl ring-white/15",
      )}
    >
      <CardBody
        task={task}
        check={
          <span className="mt-px size-[18px] shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.25)]" />
        }
      />
    </div>
  );
}

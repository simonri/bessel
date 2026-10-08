import { Check } from "lucide-react";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

export interface TaskSelection {
  /** Selecting: clicking a task toggles it instead of opening it. */
  active: boolean;
  selected: ReadonlySet<string>;
  toggle: (taskId: string) => void;
}

const TaskSelectionContext = createContext<TaskSelection | null>(null);

export const TaskSelectionProvider = TaskSelectionContext.Provider;

/** Null outside a selectable list, or while not selecting. */
export function useTaskSelection(): TaskSelection | null {
  const selection = useContext(TaskSelectionContext);
  return selection?.active ? selection : null;
}

/**
 * Square, so it reads as "pick" rather than the round "complete" check.
 * Visual only: the row around it is the control and says whether it's picked.
 */
export function SelectBox({
  checked,
  className,
}: {
  checked: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] transition-colors duration-150",
        checked
          ? "bg-primary-500 text-white"
          : "shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.3)]",
        className,
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

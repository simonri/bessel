import { createTaskMutation } from "@bessel/client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { dueDay } from "@/components/tasks/task-properties";
import { TASK_MUTATION_KEY, useTaskCacheHelpers } from "@/hooks/use-task-cache";
import { client } from "@/lib/client";

/** Turns "time to catch up with someone" into a task due today, once per person. */
export function useCatchUpTask(): {
  makeTask: (name: string) => void;
  /** A task was added (or is being added) for this person while the page was open. */
  hasTask: (name: string) => boolean;
} {
  const cache = useTaskCacheHelpers();
  const [names, setNames] = useState<ReadonlySet<string>>(new Set());
  const create = useMutation({
    ...createTaskMutation({ client }),
    mutationKey: TASK_MUTATION_KEY,
    onSettled: () => cache.settle(),
  });
  return {
    hasTask: (name) => names.has(name),
    makeTask: (name) => {
      setNames((prev) => new Set(prev).add(name));
      create.mutate(
        {
          client,
          body: {
            title: `Get in touch with ${name}`,
            due_date: dueDay(new Date()),
            status: "todo",
          },
        },
        {
          onSuccess: (task) => toast.success(`Added “${task.title}”`),
          onError: () => {
            setNames((prev) => {
              const next = new Set(prev);
              next.delete(name);
              return next;
            });
            toast.error("Couldn't add the task");
          },
        },
      );
    },
  };
}

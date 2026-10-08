import {
  createTaskV1TasksPostMutation,
  listProjectsV1ProjectsGetOptions,
} from "@bessel/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Calendar, Flag, Hash, Maximize2, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { TaskFormDialog } from "@/components/create-task-dialog";
import { TASK_MUTATION_KEY, useTaskCacheHelpers } from "@/hooks/use-task-cache";
import { client } from "@/lib/client";
import { parseQuickTask, type QuickToken } from "@/lib/task-quick-parse";
import { cn } from "@/lib/utils";

const CHIP: Record<QuickToken["kind"], string> = {
  due: "bg-primary-500/15 text-primary-300",
  project: "bg-white/[0.08] text-white/70",
  priority: "bg-amber-400/15 text-amber-300",
};

function TokenChip({ token }: { token: QuickToken }) {
  const Icon =
    token.kind === "due" ? Calendar : token.kind === "project" ? Hash : Flag;
  return (
    <span
      className={cn(
        "flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-11 font-medium animate-in fade-in zoom-in-95 duration-150",
        CHIP[token.kind],
        token.kind === "priority" &&
          token.label === "Urgent" &&
          "bg-red-500/15 text-red-300",
      )}
    >
      <Icon className="size-3" />
      {token.label}
    </span>
  );
}

/**
 * One-line capture: type "Essay draft fri #uni !" and press Enter. Dates,
 * #projects and !priority are read out of the text and shown as chips.
 */
export function QuickAddTask({
  defaultProject,
}: {
  defaultProject?: string | null;
}) {
  const [value, setValue] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogEpoch, setDialogEpoch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cache = useTaskCacheHelpers();

  const { data: projects } = useQuery(
    listProjectsV1ProjectsGetOptions({ client }),
  );
  const projectNames = useMemo(
    () => (projects ?? []).map((p) => p.name),
    [projects],
  );
  const parsed = useMemo(
    () => parseQuickTask(value, projectNames),
    [value, projectNames],
  );

  const create = useMutation({
    ...createTaskV1TasksPostMutation({ client }),
    mutationKey: TASK_MUTATION_KEY,
    onError: () => toast.error("Couldn't add the task"),
    onSettled: () => cache.settle(),
  });

  const submit = () => {
    if (!value.trim() || create.isPending) return;
    const submitted = value;
    create.mutate(
      {
        client,
        body: {
          title: parsed.title,
          due_date: parsed.dueDate,
          project: parsed.project ?? defaultProject ?? null,
          priority: parsed.priority,
          status: "todo",
        },
      },
      // Typing continues while saving; only clear what was submitted.
      { onSuccess: () => setValue((v) => (v === submitted ? "" : v)) },
    );
  };

  return (
    <div
      className={cn(
        "group flex h-9 items-center gap-2 rounded-xl bg-white/[0.04] pr-1 pl-3 ring-1 ring-white/[0.06] transition-[box-shadow,background-color] duration-150",
        "focus-within:bg-white/[0.06] focus-within:ring-primary-400/40",
      )}
    >
      <Plus className="size-4 shrink-0 text-white/35 transition-colors group-focus-within:text-primary-400" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            setValue("");
          }
        }}
        placeholder="Add a task…"
        aria-label="Add a task"
        className="h-full min-w-0 flex-1 bg-transparent text-13 text-white/90 outline-none placeholder:text-white/35"
      />
      {parsed.tokens.length > 0 && (
        <div className="flex shrink-0 items-center gap-1">
          {parsed.tokens.map((token) => (
            <TokenChip key={`${token.kind}-${token.text}`} token={token} />
          ))}
        </div>
      )}
      <button
        type="button"
        title="More options"
        aria-label="Add with more options"
        onClick={() => {
          setDialogEpoch((n) => n + 1);
          setDialogOpen(true);
        }}
        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-white/[0.07] hover:text-white/80"
      >
        <Maximize2 className="size-3.5" />
      </button>
      <TaskFormDialog
        key={dialogEpoch}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) inputRef.current?.focus();
        }}
      />
    </div>
  );
}

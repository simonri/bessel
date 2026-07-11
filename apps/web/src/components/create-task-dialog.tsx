import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@bessel/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { Input } from "@bessel/ui/components/input";
import { Textarea } from "@bessel/ui/components/textarea";
import { Label } from "@bessel/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@bessel/ui/components/popover";
import {
  createTaskV1TasksPostMutation,
  updateTaskV1TasksTaskIdPatchMutation,
  listTasksV1TasksGetQueryKey,
  listProjectsV1ProjectsGetOptions,
} from "@bessel/client";
import type { TaskSchema } from "@bessel/client";
import { toast } from "sonner";
import { client } from "@/lib/client";

const PRIORITIES = [
  { value: "0", label: "None" },
  { value: "1", label: "Low" },
  { value: "2", label: "Medium" },
  { value: "3", label: "High" },
  { value: "4", label: "Urgent" },
];

const AREAS = ["Company", "Personal", "Travel"];

const FREQUENCIES = [
  { value: "none", label: "No recurrence" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

interface ProjectInputProps {
  value: string;
  onChange: (val: string) => void;
  projects: string[];
}

function ProjectInput({ value, onChange, projects }: ProjectInputProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = value
    ? projects.filter((p) => p.toLowerCase().includes(value.toLowerCase()) && p !== value)
    : projects;

  return (
    <Popover open={open && suggestions.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder="e.g. Website redesign"
          autoComplete="off"
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          const target = (e as CustomEvent).detail?.originalEvent?.target as Node | null;
          if (inputRef.current?.contains(target)) e.preventDefault();
        }}
      >
        {suggestions.map((p) => (
          <button
            key={p}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(p);
              setOpen(false);
            }}
            className="flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            {p}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function taskToFormValues(task?: TaskSchema) {
  if (!task) {
    return {
      title: "",
      description: "",
      dueDate: "",
      priority: "0",
      project: "",
      area: "",
      frequency: "none",
      rruleDayOfWeek: "",
      rruleDayOfMonth: "",
    };
  }
  const d = task.due_date
    ? task.due_date instanceof Date
      ? task.due_date
      : new Date(String(task.due_date))
    : null;
  return {
    title: task.title ?? "",
    description: task.description ?? "",
    dueDate: d ? format(d, "yyyy-MM-dd") : "",
    priority: String(task.priority ?? 0),
    project: task.project ?? "",
    area: task.area ?? "",
    frequency: task.is_recurring ? (task.rrule_frequency ?? "none") : "none",
    rruleDayOfWeek: task.rrule_day_of_week != null ? String(task.rrule_day_of_week) : "",
    rruleDayOfMonth: task.rrule_day_of_month != null ? String(task.rrule_day_of_month) : "",
  };
}

export function TaskFormDialog({
  task,
  open,
  onOpenChange,
}: {
  task?: TaskSchema;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEditing = !!task;
  const queryClient = useQueryClient();
  const queryKey = listTasksV1TasksGetQueryKey({ client });

  const { data: projectsData = [] } = useQuery({
    ...listProjectsV1ProjectsGetOptions({ client }),
  });
  const projects = projectsData.map((p) => p.name);

  const form = useForm({
    defaultValues: taskToFormValues(task),
    onSubmit: ({ value }) => {
      const isRecurring = value.frequency !== "none";
      const freq = value.frequency as "daily" | "weekly" | "monthly" | "yearly";

      if (isEditing) {
        updateMutation.mutate({
          client,
          path: { task_id: task.id },
          body: {
            title: value.title.trim(),
            description: value.description.trim() || null,
            due_date: value.dueDate ? new Date(value.dueDate) : null,
            priority: Number(value.priority),
            project: value.project.trim() || null,
            area: value.area || null,
            is_recurring: isRecurring,
            rrule_frequency: isRecurring ? freq : null,
            rrule_interval: isRecurring ? 1 : null,
            rrule_day_of_week:
              value.frequency === "weekly" && value.rruleDayOfWeek
                ? Number(value.rruleDayOfWeek)
                : null,
            rrule_day_of_month:
              value.frequency === "monthly" && value.rruleDayOfMonth
                ? Number(value.rruleDayOfMonth)
                : null,
          },
        });
      } else {
        createMutation.mutate({
          client,
          body: {
            title: value.title.trim(),
            description: value.description.trim() || undefined,
            due_date: value.dueDate ? new Date(value.dueDate) : undefined,
            priority: Number(value.priority),
            project: value.project.trim() || undefined,
            area: value.area || undefined,
            is_recurring: isRecurring,
            rrule_frequency: isRecurring ? freq : undefined,
            rrule_interval: isRecurring ? 1 : undefined,
            rrule_day_of_week:
              value.frequency === "weekly" && value.rruleDayOfWeek
                ? Number(value.rruleDayOfWeek)
                : undefined,
            rrule_day_of_month:
              value.frequency === "monthly" && value.rruleDayOfMonth
                ? Number(value.rruleDayOfMonth)
                : undefined,
          },
        });
      }
    },
  });

  const createMutation = useMutation({
    ...createTaskV1TasksPostMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success("Task created");
      form.reset();
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to create task"),
  });

  const updateMutation = useMutation({
    ...updateTaskV1TasksTaskIdPatchMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success("Task updated");
      form.reset();
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to update task"),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Task" : "New Task"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the task details below." : "Add a new task to your board."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field
            name="title"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="task-title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="task-title"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="What needs to be done?"
                  autoFocus
                  required
                />
              </div>
            )}
          />

          <form.Field
            name="description"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Add more details…"
                  rows={3}
                  className="resize-none"
                />
              </div>
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <form.Field
              name="dueDate"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="task-due">Due date</Label>
                  <Input
                    id="task-due"
                    type="date"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            />
            <form.Field
              name="priority"
              children={(field) => (
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={field.state.value} onValueChange={field.handleChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <form.Field
              name="project"
              children={(field) => (
                <div className="space-y-2">
                  <Label>Project</Label>
                  <ProjectInput
                    value={field.state.value}
                    onChange={field.handleChange}
                    projects={projects}
                  />
                </div>
              )}
            />
            <form.Field
              name="area"
              children={(field) => (
                <div className="space-y-2">
                  <Label>Area</Label>
                  <Select
                    value={field.state.value || "none"}
                    onValueChange={(v) => field.handleChange(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {AREAS.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
          </div>

          <form.Field
            name="frequency"
            children={(field) => (
              <div className="space-y-2">
                <Label>Recurrence</Label>
                <Select value={field.state.value} onValueChange={field.handleChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />

          <form.Subscribe
            selector={(state) => [state.values.frequency] as const}
            children={([frequency]) => (
              <>
                {frequency === "weekly" && (
                  <form.Field
                    name="rruleDayOfWeek"
                    children={(field) => (
                      <div className="space-y-2">
                        <Label>Day of week</Label>
                        <Select
                          value={field.state.value || "none"}
                          onValueChange={(v) => field.handleChange(v === "none" ? "" : v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select day" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Same as due date</SelectItem>
                            {[
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                              "Saturday",
                              "Sunday",
                            ].map((day, i) => (
                              <SelectItem key={day} value={String(i)}>
                                {day}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  />
                )}

                {frequency === "monthly" && (
                  <form.Field
                    name="rruleDayOfMonth"
                    children={(field) => (
                      <div className="space-y-2">
                        <Label htmlFor="task-dom">Day of month</Label>
                        <Input
                          id="task-dom"
                          type="number"
                          min={1}
                          max={31}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="e.g. 1 for 1st of month"
                        />
                      </div>
                    )}
                  />
                )}
              </>
            )}
          />

          {(createMutation.isError || updateMutation.isError) && (
            <p className="text-sm text-destructive">
              {isEditing ? "Failed to update task." : "Failed to create task."} Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.values.title] as const}
              children={([title]) => (
                <Button type="submit" disabled={isPending || !title.trim()}>
                  {isPending
                    ? isEditing
                      ? "Saving…"
                      : "Creating…"
                    : isEditing
                      ? "Save"
                      : "Create Task"}
                </Button>
              )}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateTaskDialog() {
  const [open, setOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);

  const handleOpen = () => {
    setEpoch((e) => e + 1);
    setOpen(true);
  };

  return (
    <>
      <Button size="sm" onClick={handleOpen}>
        <Plus className="size-4" />
        Add Task
      </Button>
      <TaskFormDialog key={epoch} open={open} onOpenChange={setOpen} />
    </>
  );
}

import {
  createTaskMutation,
  listProjectsOptions,
  updateTaskMutation,
  uploadTaskAttachmentMutation,
} from "@bessel/client";
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
import { Label } from "@bessel/ui/components/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@bessel/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { Textarea } from "@bessel/ui/components/textarea";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { addDays, nextMonday, parseISO } from "date-fns";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  attachmentMarker,
  extractPastedImages,
  type PendingAttachment,
  removeMarker,
  replaceMarkerId,
} from "@/components/task-attachments";
import { useTaskCacheHelpers } from "@/hooks/use-task-cache";
import { client } from "@/lib/client";
import { localIsoDay, useLocalDay } from "@/lib/local-day";
import { cn } from "@/lib/utils";

const PRIORITIES = [
  { value: "0", label: "None" },
  { value: "1", label: "Low" },
  { value: "2", label: "Medium" },
  { value: "3", label: "High" },
  { value: "4", label: "Urgent" },
];

const FREQUENCIES = [
  { value: "none", label: "No recurrence" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/** The due date shortcuts, as "yyyy-mm-dd" days counted from `today`. */
export function dueDateQuickPicks(today: string) {
  const day = parseISO(today);
  return [
    { label: "Today", value: today },
    { label: "Tomorrow", value: localIsoDay(addDays(day, 1)) },
    { label: "Next week", value: localIsoDay(nextMonday(day)) },
  ];
}

interface ProjectInputProps {
  value: string;
  onChange: (val: string) => void;
  projects: string[];
}

function ProjectInput({ value, onChange, projects }: ProjectInputProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = value
    ? projects.filter(
        (p) => p.toLowerCase().includes(value.toLowerCase()) && p !== value,
      )
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
          const target = (e as CustomEvent).detail?.originalEvent
            ?.target as Node | null;
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
            className="flex w-full cursor-default items-center rounded-lg px-2.5 py-1.5 text-13 text-white/75 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/95"
          >
            {p}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const EMPTY_FORM = {
  title: "",
  description: "",
  dueDate: "",
  priority: "0",
  project: "",
  frequency: "none",
  rruleDayOfWeek: "",
  rruleDayOfMonth: "",
};

/** The full form for a new task; an existing one is edited in place in the task modal. */
export function TaskFormDialog({
  open,
  onOpenChange,
  defaultProject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The project a new task starts in, e.g. the one the list is filtered to. */
  defaultProject?: string | null;
}) {
  const cache = useTaskCacheHelpers();
  const today = useLocalDay();

  const { data: projectsData = [] } = useQuery({
    ...listProjectsOptions({ client }),
  });
  const projects = projectsData.map((p) => p.name);

  // Images pasted before the task exists — held locally
  // and uploaded once createMutation returns a real task_id to attach to.
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const pendingFilesRef = useRef(pendingFiles);
  pendingFilesRef.current = pendingFiles;
  useEffect(
    () => () => {
      // Dialog unmounted (e.g. cancelled) with unsaved pastes still queued —
      // release their blob URLs rather than leaking them. Reads through a
      // ref, not the pendingFiles closed over at mount time, so this always
      // sees whatever was queued most recently.
      for (const p of pendingFilesRef.current)
        URL.revokeObjectURL(p.previewUrl);
    },
    [],
  );

  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Reports failures per call, where it knows which file it was.
  const uploadAttachmentMutation = useMutation({
    ...uploadTaskAttachmentMutation({ client }),
    meta: { errorToast: false },
  });

  // Saves the description's marker swap (pending -> real id) once the new task's images are uploaded.
  const patchDescriptionMutation = useMutation({
    ...updateTaskMutation({ client }),
    meta: { errorToast: false },
    onSettled: () => cache.invalidateAll(),
  });

  // Inserts `marker` into the description at the textarea's current cursor
  // position (not wherever the field's value happens to be when this runs —
  // callers capture the cursor at paste time) and restores the cursor right
  // after it once React has re-rendered the (controlled) textarea.
  const insertMarkerAt = (position: number, marker: string) => {
    form.setFieldValue(
      "description",
      (prev) => prev.slice(0, position) + marker + prev.slice(position),
    );
    const cursor = position + marker.length;
    requestAnimationFrame(() => {
      descriptionRef.current?.setSelectionRange(cursor, cursor);
      descriptionRef.current?.focus();
    });
  };

  const handleDescriptionPaste = (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const files = extractPastedImages(e);
    if (files.length === 0) return;
    e.preventDefault();
    // Captured once, up front — uploads resolve asynchronously, and by then
    // the user may have kept typing, so "current" cursor position at insert
    // time would be the wrong spot. Each successive pasted file advances
    // past the marker just inserted for the previous one.
    let insertPos =
      descriptionRef.current?.selectionStart ??
      form.state.values.description.length;

    for (const file of files) {
      const tempId = `pending:${crypto.randomUUID()}`;
      const marker = attachmentMarker(tempId, file.name);
      insertMarkerAt(insertPos, marker);
      insertPos += marker.length;

      setPendingFiles((prev) => [
        ...prev,
        { file, previewUrl: URL.createObjectURL(file), tempId },
      ]);
    }
  };

  const form = useForm({
    defaultValues: { ...EMPTY_FORM, project: defaultProject ?? "" },
    onSubmit: ({ value }) => {
      const isRecurring = value.frequency !== "none";
      const freq = value.frequency as "daily" | "weekly" | "monthly" | "yearly";

      createMutation.mutate({
        client,
        body: {
          title: value.title.trim(),
          description: value.description.trim() || undefined,
          due_date: value.dueDate ? new Date(value.dueDate) : undefined,
          priority: Number(value.priority),
          project: value.project.trim() || undefined,
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
    },
  });

  const createMutation = useMutation({
    ...createTaskMutation({ client }),
    onSuccess: async (newTask) => {
      let description = newTask.description ?? "";
      for (const pending of pendingFiles) {
        try {
          const attachment = await uploadAttachmentMutation.mutateAsync({
            client,
            path: { task_id: newTask.id },
            body: { file: pending.file },
          });
          description = replaceMarkerId(
            description,
            pending.tempId,
            attachment.id,
          );
        } catch {
          toast.error(`Failed to attach ${pending.file.name}`);
          description = removeMarker(
            description,
            pending.tempId,
            pending.file.name,
          );
        } finally {
          URL.revokeObjectURL(pending.previewUrl);
        }
      }
      if (description !== newTask.description) {
        try {
          await patchDescriptionMutation.mutateAsync({
            client,
            path: { task_id: newTask.id },
            body: { description },
          });
        } catch {
          toast.error("Failed to save attachment references");
        }
      }
      cache.invalidateAll();
      toast.success("Task created");
      form.reset();
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to create task"),
  });

  const isPending = createMutation.isPending;

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Add a new task to your board.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="title">
            {(field) => (
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
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  ref={descriptionRef}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  onPaste={handleDescriptionPaste}
                  placeholder="Add more details… (paste an image to attach it)"
                  rows={3}
                  className="resize-none"
                />
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-3">
            <form.Field name="dueDate">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="task-due">Due date</Label>
                  <Input
                    id="task-due"
                    type="date"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-1">
                    {dueDateQuickPicks(today).map((pick) => {
                      const selected = field.state.value === pick.value;
                      return (
                        <button
                          key={pick.label}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => field.handleChange(pick.value)}
                          className={cn(
                            "h-6 rounded-full px-2.5 text-11 font-medium ring-1 transition-colors duration-150",
                            selected
                              ? "bg-white/[0.1] text-white/90 ring-white/15"
                              : "text-white/50 ring-white/[0.06] hover:bg-white/[0.05] hover:text-white/80",
                          )}
                        >
                          {pick.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </form.Field>
            <form.Field name="priority">
              {(field) => (
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={field.handleChange}
                  >
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
            </form.Field>
          </div>

          <form.Field name="project">
            {(field) => (
              <div className="space-y-2">
                <Label>Project</Label>
                <ProjectInput
                  value={field.state.value}
                  onChange={field.handleChange}
                  projects={projects}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="frequency">
            {(field) => (
              <div className="space-y-2">
                <Label>Recurrence</Label>
                <Select
                  value={field.state.value}
                  onValueChange={field.handleChange}
                >
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
          </form.Field>

          <form.Subscribe
            selector={(state) => [state.values.frequency] as const}
          >
            {([frequency]) => (
              <>
                {frequency === "weekly" && (
                  <form.Field name="rruleDayOfWeek">
                    {(field) => (
                      <div className="space-y-2">
                        <Label>Day of week</Label>
                        <Select
                          value={field.state.value || "none"}
                          onValueChange={(v) =>
                            field.handleChange(v === "none" ? "" : v)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select day" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              Same as due date
                            </SelectItem>
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
                  </form.Field>
                )}

                {frequency === "monthly" && (
                  <form.Field name="rruleDayOfMonth">
                    {(field) => (
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
                  </form.Field>
                )}
              </>
            )}
          </form.Subscribe>

          {createMutation.isError && (
            <p className="text-13 text-destructive">
              Failed to create task. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <form.Subscribe selector={(state) => [state.values.title] as const}>
              {([title]) => (
                <Button type="submit" disabled={isPending || !title.trim()}>
                  {isPending ? "Creating…" : "Create task"}
                </Button>
              )}
            </form.Subscribe>
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

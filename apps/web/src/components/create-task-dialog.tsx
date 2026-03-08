import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Plus } from "lucide-react";
import { Button } from "@metron/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metron/ui/components/dialog";
import { Input } from "@metron/ui/components/input";
import { Label } from "@metron/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metron/ui/components/select";
import {
  createTaskV1TasksPostMutation,
  listTasksV1TasksGetQueryKey,
} from "@metron/client";
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

export function CreateTaskDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    ...createTaskV1TasksPostMutation({ client }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: listTasksV1TasksGetQueryKey({ client }),
      });
      handleClose();
    },
  });

  const form = useForm({
    defaultValues: {
      title: "",
      dueDate: "",
      priority: "0",
      project: "",
      area: "",
      frequency: "none",
      rruleDayOfWeek: "",
      rruleDayOfMonth: "",
    },
    onSubmit: ({ value }) => {
      const isRecurring = value.frequency !== "none";

      mutation.mutate({
        client,
        body: {
          title: value.title.trim(),
          due_date: value.dueDate ? new Date(value.dueDate) : undefined,
          priority: Number(value.priority),
          project: value.project || undefined,
          area: value.area || undefined,
          is_recurring: isRecurring,
          rrule_frequency: isRecurring ? (value.frequency as "daily" | "weekly" | "monthly" | "yearly") : undefined,
          rrule_interval: isRecurring ? 1 : undefined,
          rrule_day_of_week: value.frequency === "weekly" && value.rruleDayOfWeek ? Number(value.rruleDayOfWeek) : undefined,
          rrule_day_of_month: value.frequency === "monthly" && value.rruleDayOfMonth ? Number(value.rruleDayOfMonth) : undefined,
        },
      });
    },
  });

  const handleClose = () => {
    setOpen(false);
    form.reset();
    mutation.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
          <DialogDescription>Add a new task to your board.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field
            name="title"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="task-title">Title</Label>
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
                  <Label htmlFor="task-project">Project</Label>
                  <Input
                    id="task-project"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="e.g. Website redesign"
                  />
                </div>
              )}
            />
            <form.Field
              name="area"
              children={(field) => (
                <div className="space-y-2">
                  <Label>Area</Label>
                  <Select value={field.state.value || "none"} onValueChange={(v) => field.handleChange(v === "none" ? "" : v)}>
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
                        <Select value={field.state.value || "none"} onValueChange={(v) => field.handleChange(v === "none" ? "" : v)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select day" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Same as due date</SelectItem>
                            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => (
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

          {mutation.isError && (
            <p className="text-destructive text-sm">Failed to create task. Please try again.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.values.title] as const}
              children={([title]) => (
                <Button type="submit" disabled={mutation.isPending || !title.trim()}>
                  {mutation.isPending ? "Creating..." : "Create Task"}
                </Button>
              )}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

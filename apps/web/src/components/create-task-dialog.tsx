import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("0");
  const [project, setProject] = useState("");
  const [area, setArea] = useState("");
  const [frequency, setFrequency] = useState("none");
  const [rruleDayOfWeek, setRruleDayOfWeek] = useState<string>("");
  const [rruleDayOfMonth, setRruleDayOfMonth] = useState<string>("");

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const isRecurring = frequency !== "none";

    mutation.mutate({
      client,
      body: {
        title: title.trim(),
        due_date: dueDate ? new Date(dueDate) : undefined,
        priority: Number(priority),
        project: project || undefined,
        area: area || undefined,
        is_recurring: isRecurring,
        rrule_frequency: isRecurring ? (frequency as "daily" | "weekly" | "monthly" | "yearly") : undefined,
        rrule_interval: isRecurring ? 1 : undefined,
        rrule_day_of_week: frequency === "weekly" && rruleDayOfWeek ? Number(rruleDayOfWeek) : undefined,
        rrule_day_of_month: frequency === "monthly" && rruleDayOfMonth ? Number(rruleDayOfMonth) : undefined,
      },
    });
  };

  const handleClose = () => {
    setOpen(false);
    setTitle("");
    setDueDate("");
    setPriority("0");
    setProject("");
    setArea("");
    setFrequency("none");
    setRruleDayOfWeek("");
    setRruleDayOfMonth("");
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="task-project">Project</Label>
              <Input
                id="task-project"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="e.g. Website redesign"
              />
            </div>
            <div className="space-y-2">
              <Label>Area</Label>
              <Select value={area || "none"} onValueChange={(v) => setArea(v === "none" ? "" : v)}>
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
          </div>

          <div className="space-y-2">
            <Label>Recurrence</Label>
            <Select value={frequency} onValueChange={setFrequency}>
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

          {frequency === "weekly" && (
            <div className="space-y-2">
              <Label>Day of week</Label>
              <Select value={rruleDayOfWeek || "none"} onValueChange={(v) => setRruleDayOfWeek(v === "none" ? "" : v)}>
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

          {frequency === "monthly" && (
            <div className="space-y-2">
              <Label htmlFor="task-dom">Day of month</Label>
              <Input
                id="task-dom"
                type="number"
                min={1}
                max={31}
                value={rruleDayOfMonth}
                onChange={(e) => setRruleDayOfMonth(e.target.value)}
                placeholder="e.g. 1 for 1st of month"
              />
            </div>
          )}

          {mutation.isError && (
            <p className="text-destructive text-sm">Failed to create task. Please try again.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !title.trim()}>
              {mutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

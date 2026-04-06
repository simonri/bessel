export const PAGE_SIZE = 50;

export const PRIORITY_COLORS: Record<number, string> = {
  0: "#71717a", 1: "#3b82f6", 2: "#eab308", 3: "#f97316", 4: "#ef4444",
};

export const PRIORITY_LABELS: Record<number, string> = {
  0: "None", 1: "Low", 2: "Medium", 3: "High", 4: "Urgent",
};

export const STATUS_LABELS: Record<string, string> = {
  todo: "To Do", in_progress: "In Progress", done: "Done", cancelled: "Cancelled",
};

export function formatDueDate(value: unknown): { label: string; color: string } {
  if (!value) return { label: "", color: "" };
  const d = value instanceof Date ? value : new Date(value as string);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (diff < 0) return { label: diff === -1 ? "Yesterday" : `${-diff}d overdue`, color: "#ef4444" };
  if (diff === 0) return { label: "Today", color: "#f97316" };
  if (diff === 1) return { label: "Tomorrow", color: "#fafafa" };
  return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), color: "#a1a1aa" };
}

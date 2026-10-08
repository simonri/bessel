import type { TaskSchema } from "@bessel/client";

const MAX_NOTES = 600;

function notesOf(task: TaskSchema): string | null {
  const notes = task.description?.trim();
  if (!notes) return null;
  return notes.length > MAX_NOTES ? `${notes.slice(0, MAX_NOTES)}…` : notes;
}

/**
 * What a Claude session is told when tasks are sent to it: the tasks in
 * order, and to hand each one back for review through the Bessel MCP tools.
 */
export function buildBatchPrompt(tasks: readonly TaskSchema[]): string {
  const list = tasks
    .map((task, i) => {
      const notes = notesOf(task);
      const lines = [`${i + 1}. ${task.title} (task_id: ${task.id})`];
      if (notes) lines.push(...notes.split("\n").map((line) => `   ${line}`));
      return lines.join("\n");
    })
    .join("\n");

  return [
    tasks.length === 1
      ? "Please work on this Bessel task:"
      : `Please work through these ${tasks.length} Bessel tasks, one at a time, in this order:`,
    "",
    list,
    "",
    "For each task:",
    "- Call start_task with its task_id. That marks it in progress and gives you its full notes.",
    "- Do the work, run the checks this repo uses, and commit it on its own. Don't push.",
    '- Then call update_tasks for it with status "in_review" and an append_note saying what changed, the commit, and how to check it.',
    "",
    'If a task is unclear, blocked, or would need something risky, don\'t guess: set it back to "todo" with an append_note explaining why, and go on to the next one.',
    "Never call complete_tasks and never mark a task done; I'll review them.",
    "When you've been through them all, give me a one-line summary per task.",
  ].join("\n");
}

import type { TaskSchema } from "@bessel/client";
import { describe, expect, it } from "vitest";
import { buildBatchPrompt } from "./task-batch";

const task = (id: string, title: string, description?: string) =>
  ({ id, title, description }) as TaskSchema;

describe("buildBatchPrompt", () => {
  it("lists the tasks in order with their ids and notes", () => {
    const prompt = buildBatchPrompt([
      task("t1", "Fix login", "Seen on iOS\nafter update"),
      task("t2", "Add dark map"),
    ]);
    expect(prompt).toContain("these 2 Bessel tasks, one at a time");
    expect(prompt).toContain(
      "1. Fix login (task_id: t1)\n   Seen on iOS\n   after update\n2. Add dark map (task_id: t2)",
    );
  });

  it("asks for review, never done", () => {
    const prompt = buildBatchPrompt([task("t1", "Fix login")]);
    expect(prompt).toContain("Please work on this Bessel task:");
    expect(prompt).toContain('status "in_review"');
    expect(prompt).toContain("Never call complete_tasks");
  });

  it("shortens very long notes", () => {
    const prompt = buildBatchPrompt([task("t1", "Big", "x".repeat(2000))]);
    expect(prompt).toContain(`${"x".repeat(600)}…`);
    expect(prompt).not.toContain("x".repeat(601));
  });
});

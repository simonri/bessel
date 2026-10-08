import { describe, expect, it } from "vitest";
import { KeyedMutex } from "./keyed-mutex.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("KeyedMutex", () => {
  it("runs tasks for the same key one at a time, in order", async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const gate = deferred();
    const first = mutex.run("a", async () => {
      order.push("first:start");
      await gate.promise;
      order.push("first:end");
    });
    const second = mutex.run("a", async () => {
      order.push("second");
    });
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("does not block other keys", async () => {
    const mutex = new KeyedMutex();
    const gate = deferred();
    const blocked = mutex.run("a", () => gate.promise);
    await expect(mutex.run("b", async () => "b")).resolves.toBe("b");
    gate.resolve();
    await blocked;
  });

  it("keeps going after a task rejects and propagates the error", async () => {
    const mutex = new KeyedMutex();
    const failing = mutex.run("a", async () => {
      throw new Error("boom");
    });
    const next = mutex.run("a", async () => 42);
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe(42);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutputCoalescer, terminalSize } from "./terminal-core.js";

describe("terminalSize", () => {
  it("accepts positive dimensions and truncates fractions", () => {
    expect(terminalSize(80, 24)).toEqual({ cols: 80, rows: 24 });
    expect(terminalSize(80.9, 24.2)).toEqual({ cols: 80, rows: 24 });
  });

  it("clamps oversized dimensions", () => {
    expect(terminalSize(1e9, 1e9)).toEqual({ cols: 1000, rows: 500 });
  });

  it("rejects zero, negative, non-finite and non-numeric values", () => {
    expect(terminalSize(0, 24)).toBeNull();
    expect(terminalSize(80, -1)).toBeNull();
    expect(terminalSize(Number.NaN, 24)).toBeNull();
    expect(terminalSize(Number.POSITIVE_INFINITY, 24)).toBeNull();
    expect(terminalSize("80", 24)).toBeNull();
    expect(terminalSize(undefined, undefined)).toBeNull();
  });
});

describe("OutputCoalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("merges chunks that arrive within the delay", () => {
    const emit = vi.fn();
    const coalescer = new OutputCoalescer(emit, 16, 1024);
    coalescer.push("a");
    coalescer.push("b");
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(emit).toHaveBeenCalledExactlyOnceWith("ab");
  });

  it("flushes immediately once the size cap is reached", () => {
    const emit = vi.fn();
    const coalescer = new OutputCoalescer(emit, 16, 4);
    coalescer.push("ab");
    coalescer.push("cd");
    expect(emit).toHaveBeenCalledExactlyOnceWith("abcd");
    vi.advanceTimersByTime(16);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("flushes pending output on demand and drops it on discard", () => {
    const emit = vi.fn();
    const coalescer = new OutputCoalescer(emit);
    coalescer.push("tail");
    coalescer.flush();
    expect(emit).toHaveBeenCalledExactlyOnceWith("tail");
    coalescer.push("gone");
    coalescer.discard();
    vi.advanceTimersByTime(100);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

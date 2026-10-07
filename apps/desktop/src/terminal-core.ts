const MAX_COLS = 1000;
const MAX_ROWS = 500;

/** Normalizes renderer-supplied terminal dimensions; null when unusable. */
export function terminalSize(
  cols: unknown,
  rows: unknown,
): { cols: number; rows: number } | null {
  if (typeof cols !== "number" || typeof rows !== "number") return null;
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return null;
  const c = Math.trunc(cols);
  const r = Math.trunc(rows);
  if (c < 1 || r < 1) return null;
  return { cols: Math.min(c, MAX_COLS), rows: Math.min(r, MAX_ROWS) };
}

/**
 * Batches PTY output into fewer IPC messages: a chunk is held for up to
 * `delayMs`, or until `maxChars` characters have accumulated.
 */
export class OutputCoalescer {
  private buffer = "";
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly emit: (data: string) => void,
    private readonly delayMs = 16,
    private readonly maxChars = 64 * 1024,
  ) {}

  push(data: string): void {
    this.buffer += data;
    if (this.buffer.length >= this.maxChars) {
      this.flush();
      return;
    }
    this.timer ??= setTimeout(() => this.flush(), this.delayMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.buffer) return;
    const data = this.buffer;
    this.buffer = "";
    this.emit(data);
  }

  discard(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.buffer = "";
  }
}

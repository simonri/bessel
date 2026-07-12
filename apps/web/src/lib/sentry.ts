import { isDesktop } from "@/lib/environment";

// Dynamically imported so the standalone (non-desktop) web build never pulls
// in the Electron renderer SDK. It reports through the main process over
// IPC and inherits its dsn/release/environment — see apps/desktop/src/main.ts.
let sentry: typeof import("@sentry/electron/renderer") | undefined;

export async function initSentry() {
  if (!isDesktop) return;
  sentry = await import("@sentry/electron/renderer");
  sentry.init();
}

export function captureException(error: unknown, extra?: Record<string, unknown>) {
  sentry?.captureException(error, extra ? { extra } : undefined);
}

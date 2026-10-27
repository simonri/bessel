// The Bessel iOS builds' URL schemes, as the API allows them in `state`.
const APP_SCHEME = /^com\.simonri\.bessel(\.[A-Za-z0-9]+)?$/;
const SEPARATOR = "~";

export type ConnectResult =
  | { status: "connected"; email: string }
  | { status: "failed"; message: string };

/**
 * Where to send the app when the phone started this Google sign-in: its own
 * URL scheme, with the result only. The code never leaves this page, and any
 * scheme that isn't a Bessel app's is ignored.
 */
export function appReturnURL(
  state: string | null,
  result: ConnectResult,
): string | null {
  if (!state?.includes(SEPARATOR)) return null;
  const scheme = state.slice(0, state.indexOf(SEPARATOR));
  if (!APP_SCHEME.test(scheme)) return null;
  const params = new URLSearchParams(
    result.status === "connected"
      ? { result: "connected", email: result.email }
      : { result: "failed", message: result.message },
  );
  return `${scheme}://oauth/google-calendar?${params.toString()}`;
}

/** Hands control back to the app; the browser sheet closes on its scheme. */
export function returnToApp(url: string): void {
  window.location.replace(url);
}

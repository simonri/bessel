import { MissingRefreshTokenError } from "@auth0/auth0-react";

type Refresher = () => Promise<unknown>;

const SESSION_ENDED_ERRORS = new Set([
  "login_required",
  "consent_required",
  "invalid_grant",
]);

let refresher: Refresher | null = null;
let inFlight: Promise<void> | null = null;

/** Whether a token failure means the session is over, as opposed to a
 *  transient one (offline, timeout) that a later request can recover from. */
export function isSessionEndedError(error: unknown): boolean {
  if (error instanceof MissingRefreshTokenError) return true;
  const code = (error as { error?: unknown } | null)?.error;
  return typeof code === "string" && SESSION_ENDED_ERRORS.has(code);
}

/** Registered by the auth provider while signed in; null when signed out. */
export function setAccessTokenRefresher(next: Refresher | null) {
  refresher = next;
}

/** Fetches a new access token after the API rejected the current one, so a
 *  retry sends the fresh token. Concurrent 401s share one refresh, and a
 *  failed refresh is left for the auth provider to act on. */
export function refreshAccessToken(): Promise<void> {
  if (!refresher) return Promise.resolve();
  inFlight ??= refresher()
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

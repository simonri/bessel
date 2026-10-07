/** The `detail` message of a Bessel API error body, or `fallback` when there isn't one. */
export function errorDetail(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

/**
 * Whether a Bessel API error means the resource doesn't exist — by HTTP
 * status when the error carries one, else by the `ResourceNotFound` body.
 */
export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { status, error: kind } = error as {
    status?: unknown;
    error?: unknown;
  };
  return status === 404 || kind === "ResourceNotFound";
}

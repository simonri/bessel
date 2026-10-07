const API_ERROR = Symbol("bessel.apiError");
const MAX_TRANSIENT_RETRIES = 2;

/** An error thrown by the API client: the response body for a failed response,
 *  with its HTTP `status`; network and token failures keep their own shape and
 *  have no status. */
export type ApiError = { status?: number; [API_ERROR]: true } & Record<
  PropertyKey,
  unknown
>;

/** The `detail` message of a Bessel API error body, or `fallback` when there isn't one. */
export function errorDetail(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

/** Marks `error` as coming from the API client and, for a failed response,
 *  gives it the response's HTTP status. Non-JSON bodies are kept as `body`. */
export function toApiError(error: unknown, response?: Response): ApiError {
  const failed = response && !response.ok ? response.status : undefined;
  const base: object =
    error !== null && typeof error === "object"
      ? error
      : { body: error === undefined || error === "" ? undefined : error };
  const fields: Record<PropertyKey, unknown> = { [API_ERROR]: true };
  if (failed !== undefined) fields.status = failed;
  return Object.assign(base, fields) as ApiError;
}

export function isApiError(error: unknown): error is ApiError {
  return (
    error !== null &&
    typeof error === "object" &&
    (error as Record<PropertyKey, unknown>)[API_ERROR] === true
  );
}

/** The HTTP status of a failed API response, or undefined for anything else
 *  (network failures, token failures, non-API errors). */
export function errorStatus(error: unknown): number | undefined {
  if (!isApiError(error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

/** Query retry policy: client errors are final, except one retry of a 401 once
 *  the token has been refreshed; server and network errors retry twice. */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  const status = errorStatus(error);
  if (status === 401) return failureCount < 1;
  if (status !== undefined && status < 500) return false;
  return failureCount < MAX_TRANSIENT_RETRIES;
}

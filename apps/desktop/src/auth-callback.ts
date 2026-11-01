/**
 * The `state` of an authorize URL that sends its answer to this loopback, or
 * null for any other URL.
 */
export function loopbackAuthState(url: string, port: number): string | null {
  try {
    const parsed = new URL(url);
    const redirect = parsed.searchParams.get("redirect_uri") ?? "";
    return redirect.startsWith(`http://127.0.0.1:${port}/`)
      ? parsed.searchParams.get("state")
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether a request to the loopback is the answer to the login this window
 * started. Any web page can request a loopback URL; one with a made-up state
 * must not end the attempt before the real redirect arrives. Auth0 reports a
 * denied or failed login with `error` instead of `code`, which still counts.
 */
export function isLoginAnswer(
  params: URLSearchParams,
  expectedState: string | null,
): boolean {
  return (
    !!expectedState &&
    params.get("state") === expectedState &&
    !!(params.get("code") || params.get("error"))
  );
}

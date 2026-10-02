import http from "http";

export const DEFAULT_WINDOW_DAYS = 90;
export const MAX_WINDOW_DAYS = 365;
const REQUEST_TIMEOUT_MS = 10_000;

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseWindowDays(url: string | undefined): number {
  const raw = url
    ? new URL(url, "http://localhost").searchParams.get("days")
    : null;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_WINDOW_DAYS;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WINDOW_DAYS;
  return Math.min(parsed, MAX_WINDOW_DAYS);
}

// Pure Node http.Server — no Electron imports — so the routing, Host-header
// check, GET-only enforcement, and JSON error shapes can be exercised with a
// plain Node script (see scripts this was verified against) without needing
// a running Electron renderer. `requestPayload` is the only side-effecting
// dependency; local-data-server.ts wires it to the real IPC round-trip with
// the renderer.
export function createLocalDataServer(
  requestPayload: (windowDays: number) => Promise<unknown>,
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: "method_not_allowed",
        message: "Only GET is supported.",
      });
      return;
    }

    // Defeats DNS rebinding: a malicious page's background fetch() arrives
    // with a Host header naming its own domain (browsers never rewrite Host
    // to match the resolved IP), so this is the cheap, correct defense for a
    // server meant to be read by local tools, not browsers.
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : null;
    const host = req.headers.host;
    if (
      !port ||
      (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)
    ) {
      sendJson(res, 403, {
        error: "forbidden",
        message: "Invalid Host header.",
      });
      return;
    }

    const windowDays = parseWindowDays(req.url);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      sendJson(res, 503, {
        error: "timeout",
        message:
          "Timed out waiting for the Bessel desktop app to respond — make sure it's open and you're logged in.",
      });
    }, REQUEST_TIMEOUT_MS);

    requestPayload(windowDays).then(
      (payload) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        sendJson(res, 200, payload);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        sendJson(res, 503, {
          error: "unavailable",
          message: err instanceof Error ? err.message : String(err),
        });
      },
    );
  });

  return server;
}

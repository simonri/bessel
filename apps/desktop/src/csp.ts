import crypto from "crypto";
import fs from "fs";

// Content-Security-Policy for the packaged renderer (app://localhost). The
// renderer can spawn terminals through IPC, so script-src is what turns any
// future HTML-injection bug into "nothing runs" instead of code execution.
// The prerendered index.html carries a few inline bootstrap scripts whose
// contents change every build, so they're allowed by hash, computed from the
// file actually being served rather than 'unsafe-inline'.
//
// Everything else is deliberately broad where the app needs it: images come
// from arbitrary hosts (place photos, avatars, map tiles, remote images in
// notes), and the API host is a build-time setting the main process doesn't
// know, so connect-src allows https: plus the local dev API.
const STATIC_DIRECTIVES = [
  "default-src 'self'",
  "connect-src 'self' https: http://localhost:8100 http://127.0.0.1:8100 vault: data: blob:",
  "img-src 'self' https: http: data: blob: vault:",
  "media-src 'self' blob: vault:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  // The browser widget's <webview> loads arbitrary sites.
  "frame-src https: http:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const INLINE_SCRIPT = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;

const cache = new Map<string, { mtimeMs: number; policy: string }>();

export function contentSecurityPolicyFor(htmlPath: string): string {
  const { mtimeMs } = fs.statSync(htmlPath);
  const cached = cache.get(htmlPath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.policy;

  const html = fs.readFileSync(htmlPath, "utf8");
  const hashes = new Set<string>();
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    // Hash what the browser executes, not the raw bytes: the HTML parser
    // normalizes newlines and replaces NUL with U+FFFD (the router's
    // hydration script embeds a NUL).
    const body = match[1].replace(/\r\n?/g, "\n").replace(/\0/g, "�");
    if (!body.trim()) continue;
    const digest = crypto.createHash("sha256").update(body).digest("base64");
    hashes.add(`'sha256-${digest}'`);
  }
  const policy = [
    `script-src 'self' ${[...hashes].join(" ")}`.trim(),
    ...STATIC_DIRECTIVES,
  ].join("; ");
  cache.set(htmlPath, { mtimeMs, policy });
  return policy;
}

export function withContentSecurityPolicy(
  response: Response,
  policy: string,
): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", policy);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

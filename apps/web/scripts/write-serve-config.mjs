// Writes serve.json next to the built index.html so `serve` sends security
// headers with the web app. The inline bootstrap scripts change every build,
// so script-src allows them by hash rather than 'unsafe-inline': an injected
// <script> then never runs, and it can't read the Auth0 tokens in storage.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(import.meta.dirname, "../dist/client");
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");

function inlineScriptHashes(source) {
  const hashes = new Set();
  for (const [, body] of source.matchAll(
    /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g,
  )) {
    // Hash what the browser runs: the HTML parser normalizes newlines and
    // turns NUL (in the router's hydration script) into U+FFFD.
    const parsed = body.replace(/\r\n?/g, "\n").replace(/\0/g, "�");
    if (!parsed.trim()) continue;
    hashes.add(
      `'sha256-${crypto.createHash("sha256").update(parsed).digest("base64")}'`,
    );
  }
  return [...hashes];
}

const policy = [
  `script-src 'self' ${inlineScriptHashes(html).join(" ")}`,
  "default-src 'self'",
  "connect-src 'self' https: wss:",
  "img-src 'self' https: data: blob:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  "frame-src https:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const config = {
  headers: [
    {
      source: "**",
      headers: [
        { key: "Content-Security-Policy", value: policy },
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), payment=()",
        },
      ],
    },
  ],
};

fs.writeFileSync(
  path.join(dist, "serve.json"),
  `${JSON.stringify(config, null, 2)}\n`,
);

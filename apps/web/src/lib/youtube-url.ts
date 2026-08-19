const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function isYouTubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "youtube.com" || host.endsWith(".youtube.com");
}

function isYouTubeNoCookieHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com")
  );
}

function validVideoId(value: string | null | undefined): string | null {
  return value && VIDEO_ID_PATTERN.test(value) ? value : null;
}

function videoIdFromUrl(url: URL): string | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" || host.endsWith(".youtu.be")) {
    return validVideoId(segments[0]);
  }

  if (!isYouTubeHost(host) && !isYouTubeNoCookieHost(host)) return null;
  if (url.pathname === "/watch") return validVideoId(url.searchParams.get("v"));
  if (["embed", "shorts", "live", "v"].includes(segments[0])) {
    return validVideoId(segments[1]);
  }
  return null;
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
  if (!match?.slice(1).some(Boolean)) return null;
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  );
}

function startTimeFromUrl(url: URL): number | null {
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  return parseTimestamp(
    url.searchParams.get("start") ??
      url.searchParams.get("t") ??
      hashParams.get("t"),
  );
}

export function isYouTubeEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    return (
      (isYouTubeHost(url.hostname) || isYouTubeNoCookieHost(url.hostname)) &&
      segments[0] === "embed" &&
      validVideoId(segments[1]) !== null
    );
  } catch {
    return false;
  }
}

export function toYouTubeEmbedUrl(value: string): string | null {
  let source: URL;
  try {
    source = new URL(value);
  } catch {
    return null;
  }

  const videoId = videoIdFromUrl(source);
  if (!videoId) return null;

  const embed = new URL(`https://www.youtube.com/embed/${videoId}`);
  embed.searchParams.set("autoplay", "1");
  embed.searchParams.set("controls", "1");
  embed.searchParams.set("fs", "1");
  embed.searchParams.set("playsinline", "1");
  embed.searchParams.set("rel", "0");

  const start = startTimeFromUrl(source);
  if (start !== null && start > 0)
    embed.searchParams.set("start", String(start));

  return embed.toString();
}

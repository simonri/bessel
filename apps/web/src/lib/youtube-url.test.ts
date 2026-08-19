import { describe, expect, it } from "vitest";
import { isYouTubeEmbedUrl, toYouTubeEmbedUrl } from "./youtube-url";

const VIDEO_ID = "dQw4w9WgXcQ";

describe("toYouTubeEmbedUrl", () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    `https://m.youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/live/${VIDEO_ID}`,
    `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`,
  ])("turns %s into a focused player URL", (source) => {
    const result = toYouTubeEmbedUrl(source);
    expect(result).not.toBeNull();
    const url = new URL(result!);
    expect(url.origin + url.pathname).toBe(
      `https://www.youtube.com/embed/${VIDEO_ID}`,
    );
    expect(url.searchParams.get("autoplay")).toBe("1");
    expect(url.searchParams.get("controls")).toBe("1");
    expect(url.searchParams.get("fs")).toBe("1");
    expect(url.searchParams.get("rel")).toBe("0");
  });

  it("preserves numeric and duration timestamps", () => {
    expect(
      new URL(
        toYouTubeEmbedUrl(`https://youtu.be/${VIDEO_ID}?t=1m32s`)!,
      ).searchParams.get("start"),
    ).toBe("92");
    expect(
      new URL(
        toYouTubeEmbedUrl(
          `https://www.youtube.com/watch?v=${VIDEO_ID}&start=45`,
        )!,
      ).searchParams.get("start"),
    ).toBe("45");
  });

  it("ignores non-video and lookalike URLs", () => {
    expect(toYouTubeEmbedUrl("https://www.youtube.com")).toBeNull();
    expect(
      toYouTubeEmbedUrl(`https://youtube.com.evil.test/watch?v=${VIDEO_ID}`),
    ).toBeNull();
    expect(
      toYouTubeEmbedUrl("https://example.com/watch?v=dQw4w9WgXcQ"),
    ).toBeNull();
    expect(
      toYouTubeEmbedUrl(`ftp://www.youtube.com/watch?v=${VIDEO_ID}`),
    ).toBeNull();
  });
});

describe("isYouTubeEmbedUrl", () => {
  it("only recognizes valid YouTube embed pages", () => {
    expect(isYouTubeEmbedUrl(`https://www.youtube.com/embed/${VIDEO_ID}`)).toBe(
      true,
    );
    expect(
      isYouTubeEmbedUrl(`https://www.youtube.com/watch?v=${VIDEO_ID}`),
    ).toBe(false);
    expect(isYouTubeEmbedUrl("not a url")).toBe(false);
  });
});

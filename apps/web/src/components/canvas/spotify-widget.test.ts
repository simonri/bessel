import { describe, expect, it } from "vitest";
import { thumbnailUrl } from "./spotify-widget";

describe("thumbnailUrl", () => {
  it("asks Spotify's CDN for the 64px cover", () => {
    expect(
      thumbnailUrl(
        "https://i.scdn.co/image/ab67616d0000b273f254d160fea87a7c0ae4f5cd",
      ),
    ).toBe("https://i.scdn.co/image/ab67616d00004851f254d160fea87a7c0ae4f5cd");
  });

  it("repairs the dead open.spotify.com form older clients report", () => {
    expect(
      thumbnailUrl("https://open.spotify.com/image/ab67616d0000b273abc"),
    ).toBe("https://i.scdn.co/image/ab67616d00004851abc");
  });

  it("ignores missing or unknown art", () => {
    expect(thumbnailUrl(undefined)).toBeUndefined();
    expect(thumbnailUrl("")).toBeUndefined();
    expect(thumbnailUrl("file:///tmp/cover.png")).toBeUndefined();
  });
});

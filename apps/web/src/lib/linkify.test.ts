import { describe, expect, it } from "vitest";
import { linkify, shortLink } from "./linkify";

const links = (text: string) => linkify(text).filter((p) => p.type === "link");

describe("linkify", () => {
  it("keeps the text around links and joins back to the original", () => {
    const text = "Docs: https://mcp.montrose.io/docs and more";
    const parts = linkify(text);

    expect(parts).toEqual([
      { type: "text", text: "Docs: " },
      {
        type: "link",
        text: "https://mcp.montrose.io/docs",
        href: "https://mcp.montrose.io/docs",
      },
      { type: "text", text: " and more" },
    ]);
    expect(parts.map((p) => p.text).join("")).toBe(text);
  });

  it("leaves out sentence punctuation and a bracket the link didn't open", () => {
    expect(
      links("(see https://github.com/simonri/bessel/pull/72)").map(
        (p) => p.text,
      ),
    ).toEqual(["https://github.com/simonri/bessel/pull/72"]);
    expect(
      links(
        "Read https://x.se/a. Then https://x.se/b, and https://x.se/c!",
      ).map((p) => p.text),
    ).toEqual(["https://x.se/a", "https://x.se/b", "https://x.se/c"]);
    expect(
      links("https://en.wikipedia.org/wiki/Bessel_(crater)").map((p) => p.text),
    ).toEqual(["https://en.wikipedia.org/wiki/Bessel_(crater)"]);
  });

  it("turns email addresses into mailto links", () => {
    expect(links("Ask support@montrose.io if it fails again.")).toEqual([
      {
        type: "link",
        text: "support@montrose.io",
        href: "mailto:support@montrose.io",
      },
    ]);
  });

  it("links only web and email addresses", () => {
    expect(
      links("javascript:alert(1) file:///etc/passwd ftp://x.se www.x.se"),
    ).toEqual([]);
  });
});

describe("shortLink", () => {
  it("drops the scheme, www. and a trailing slash", () => {
    expect(shortLink("https://www.montrose.io/")).toBe("montrose.io");
    expect(shortLink("https://mcp.montrose.io/docs/")).toBe(
      "mcp.montrose.io/docs",
    );
    expect(shortLink("http://x.se/a?q=1#top")).toBe("x.se/a?q=1#top");
  });

  it("shows an email link as the address", () => {
    expect(shortLink("mailto:support@montrose.io")).toBe("support@montrose.io");
  });

  it("decodes escaped characters", () => {
    expect(shortLink("https://sv.wikipedia.org/wiki/K%C3%B6ttbullar")).toBe(
      "sv.wikipedia.org/wiki/Köttbullar",
    );
  });

  it("keeps the last segment of a long link and marks what was cut", () => {
    expect(
      shortLink(
        "https://github.com/simonri/bessel/blob/master/apps/web/src/lib/linkify.ts",
      ),
    ).toBe("github.com/…/linkify.ts");
    expect(
      shortLink(
        "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit?tab=t.0",
      ),
    ).toBe("docs.google.com/…/edit…");
  });

  it("cuts a long link at the end when its last segment is long too", () => {
    const label = shortLink(`https://x.se/${"a".repeat(80)}`);
    expect(label).toHaveLength(48);
    expect(label.startsWith("x.se/aaa")).toBe(true);
    expect(label.endsWith("…")).toBe(true);
  });
});

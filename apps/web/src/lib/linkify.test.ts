import { describe, expect, it } from "vitest";
import { linkify } from "./linkify";

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

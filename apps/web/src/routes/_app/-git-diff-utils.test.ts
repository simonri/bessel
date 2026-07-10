import { describe, expect, it } from "vitest";
import { buildHighlightMap, detectLang, parseDiff } from "./-git-diff-utils";

function makeDiff(context: string): string {
  const body = context.split("\n");
  return [
    "diff --git a/f.ts b/f.ts",
    "--- a/f.ts",
    "+++ b/f.ts",
    `@@ -1,${body.length} +1,${body.length} @@`,
    ...body.map((l) => ` ${l}`),
  ].join("\n");
}

describe("buildHighlightMap", () => {
  it("highlights a normal diff", async () => {
    const content = "const x: number = 1;";
    const lines = parseDiff(makeDiff(content));
    const map = await buildHighlightMap(lines, "typescript", content, content);
    expect(map.size).toBeGreaterThan(0);
  });

  it("correctly tokenizes a JSX attribute with a non-trivial expression value", async () => {
    // Regression: highlight.js's JSX handling breaks on attribute values like
    // this (misparses `{()` as closing the attribute), leaving everything
    // after it in the tag completely unstyled. Shiki must not repeat that.
    const content = [
      "function C() {",
      '  return <button onClick={() => update({ x: 1 })} className="a">Go</button>;',
      "}",
    ].join("\n");
    const lines = parseDiff(makeDiff(content));
    const map = await buildHighlightMap(lines, "tsx", content, content);
    const returnLineIdx = lines.findIndex((l) => l.content.includes("<button"));
    const tokens = map.get(returnLineIdx);
    expect(tokens).toBeDefined();
    const joined = tokens!.map((t) => t.content).join("");
    expect(joined).toBe(content.split("\n")[1]);
    // "className" must have been reached and tokenized (not swallowed as
    // plain text after onClick's arrow function confused the grammar).
    const classNameToken = tokens!.find((t) => t.content === "className");
    expect(classNameToken?.color).toBeDefined();
  });

  it("never throws on malformed/unsupported input", async () => {
    const content = "\0\0 not really typescript {{{{ ";
    const lines = parseDiff(makeDiff(content));
    await expect(
      buildHighlightMap(lines, "typescript", content, content),
    ).resolves.not.toThrow();
  });

  it("skips full-file highlighting past the size cap without hanging", async () => {
    const huge = "const x = 1;\n".repeat(50_000); // ~700k chars
    const lines = parseDiff(makeDiff("const x = 1;"));
    const start = performance.now();
    await buildHighlightMap(lines, "typescript", huge, huge);
    expect(performance.now() - start).toBeLessThan(5000);
  });

  it("returns an empty map when no language is detected", async () => {
    const lines = parseDiff(makeDiff("hello"));
    const map = await buildHighlightMap(lines, undefined, "hello", "hello");
    expect(map.size).toBe(0);
  });

  it("detects language from extension, case-insensitively", () => {
    expect(detectLang("src/App.TSX")).toBe("tsx");
    expect(detectLang("README.md")).toBe("markdown");
    expect(detectLang("noext")).toBeUndefined();
    expect(detectLang(undefined)).toBeUndefined();
  });
});

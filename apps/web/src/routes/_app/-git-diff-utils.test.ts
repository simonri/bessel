import { describe, expect, it, vi } from "vitest";
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
  it("highlights removed lines from the old file and added lines from the new one", async () => {
    const oldContent = "const a = 1;\nlet b = 2;";
    const newContent = "const a = 1;\nvar c = 3;";
    const lines = parseDiff(
      ["@@ -1,2 +1,2 @@", " const a = 1;", "-let b = 2;", "+var c = 3;"].join(
        "\n",
      ),
    );
    const map = await buildHighlightMap(
      lines,
      "typescript",
      oldContent,
      newContent,
    );

    const text = (idx: number) =>
      map
        .get(idx)
        ?.map((t) => t.content)
        .join("");
    expect([text(1), text(2), text(3)]).toEqual([
      "const a = 1;",
      "let b = 2;",
      "var c = 3;",
    ]);
    const keyword = map.get(1)?.find((t) => t.content === "const");
    const name = map.get(1)?.find((t) => t.content.trim() === "a");
    expect(keyword?.color).toBeDefined();
    expect(name).toBeDefined();
    expect(keyword?.color).not.toBe(name?.color);
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

  it("leaves lines plain when tokenizing throws", async () => {
    vi.resetModules();
    vi.doMock("shiki/core", () => ({
      createHighlighterCore: async () => ({
        loadLanguage: async () => {},
        codeToTokens: () => {
          throw new Error("grammar bug");
        },
      }),
    }));
    try {
      const utils = await import("./-git-diff-utils");
      const content = "const x = 1;";
      const lines = utils.parseDiff(makeDiff(content));
      const map = await utils.buildHighlightMap(
        lines,
        "typescript",
        content,
        content,
      );
      expect(map.size).toBe(0);
    } finally {
      vi.doUnmock("shiki/core");
      vi.resetModules();
    }
  });

  it("tokenizes lines on their own when the file is past the size cap", async () => {
    const line = "const y = 1;";
    const filler = "x\n".repeat(110_000);
    const huge = `/*\n${filler}${line}\n*/\n`;
    const lineNum = filler.split("\n").length + 1;
    const lines = parseDiff(
      [`@@ -${lineNum},1 +${lineNum},1 @@`, ` ${line}`].join("\n"),
    );

    const map = await buildHighlightMap(lines, "typescript", huge, huge);
    const standalone = await buildHighlightMap(
      parseDiff(makeDiff(line)),
      "typescript",
      line,
      line,
    );

    const keyword = map.get(1)?.find((t) => t.content === "const");
    expect(keyword?.color).toBeDefined();
    expect(map.get(1)).toEqual(standalone.get(4));
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

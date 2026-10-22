import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The type scale lives in packages/ui/src/styles/globals.css. Text sizes come
// from its steps (text-11, text-12, text-13, text-15) or its roles
// (type-title, type-metric, type-heading, type-section, type-label,
// type-caption, type-badge), so pages can't each invent their own.
const FORBIDDEN: [RegExp, string][] = [
  [
    /(?<![\w-])text-(xs|sm|base|lg)(?![\w-])/,
    "use text-12/text-13 or a type-* role",
  ],
  [/(?<![\w-])text-\[\d+(\.\d+)?(px|rem)\]/, "use a step from the type scale"],
  [
    /(?<![\w-])font-(bold|extrabold|black)(?![\w-])/,
    "semibold is the heaviest weight",
  ],
  [
    /(?<![\w-])tracking-(wide|wider|widest)(?![\w-])/,
    "small labels use type-section, not letter-spacing",
  ],
];

const SRC = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

describe("typography", () => {
  it("every component sizes text from the type scale", () => {
    const offences: string[] = [];
    for (const file of sources(SRC)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          for (const [pattern, fix] of FORBIDDEN) {
            const match = line.match(pattern);
            if (match)
              offences.push(
                `${relative(SRC, file)}:${index + 1} ${match[0]} - ${fix}`,
              );
          }
        });
    }
    expect(offences).toEqual([]);
  });
});

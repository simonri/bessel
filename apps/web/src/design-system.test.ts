import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Controls whose height comes from their `size` prop (see
// packages/ui/src/lib/control-size.ts). A height class passed alongside
// either loses to the size (so it silently does nothing) or wins and leaves
// the control out of line with its neighbours.
const SIZED_CONTROLS = [
  "SelectTrigger",
  "SoftButton",
  "IconButton",
  "PrimaryButton",
];
const HEIGHT_CLASS =
  /(?:^|[\s"'`{])!?(?:[\w-]+:)*(?:h|size|min-h|max-h)-(?:\d|\[|auto|full|px)[^\s"'`]*|data-\[size/;
// The kit defines these controls and composes them internally.
const EXEMPT_FILES = new Set(["components/ui-kit.tsx"]);

const SRC = new URL(".", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)
      ? [path]
      : [];
  });
}

export function heightOverrides(source: string): string[] {
  const tag = new RegExp(
    `<(${SIZED_CONTROLS.join("|")})\\b([^>]*?(?:\\{[^}]*\\}[^>]*?)*)/?>`,
    "g",
  );
  const found: string[] = [];
  for (const match of source.matchAll(tag)) {
    const className = match[2].match(/className=(\{[^}]*\}|"[^"]*")/)?.[1];
    const height = className?.match(HEIGHT_CLASS)?.[0].trim();
    if (height) {
      const line = source.slice(0, match.index).split("\n").length;
      found.push(`line ${line}: <${match[1]}> has "${height}"`);
    }
  }
  return found;
}

describe("design system", () => {
  it("detects height classes on sized controls", () => {
    expect(
      heightOverrides('<SoftButton className="h-7 px-2">x</SoftButton>'),
    ).toHaveLength(1);
    expect(
      heightOverrides(
        '<SelectTrigger\n  size="sm"\n  className="h-7! w-24"\n>',
      ),
    ).toHaveLength(1);
    expect(
      heightOverrides(
        '<IconButton className="opacity-0 group-hover:size-5" />',
      ),
    ).toHaveLength(1);
    expect(
      heightOverrides('<SelectTrigger className="w-44 data-[size=sm]:h-auto">'),
    ).toHaveLength(1);
    expect(
      heightOverrides('<PrimaryButton size="sm" className="w-full">'),
    ).toEqual([]);
    expect(heightOverrides('<SoftButton className="shadow-none" />')).toEqual(
      [],
    );
  });

  it("sizes shared controls with their size prop, never a height class", () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => !EXEMPT_FILES.has(relative(SRC, path)))
      .flatMap((path) =>
        heightOverrides(readFileSync(path, "utf8")).map(
          (issue) => `${relative(SRC, path)} ${issue}`,
        ),
      );
    expect(
      offenders,
      "Use the control's size prop (xs/sm/default) instead of a height class",
    ).toEqual([]);
  });
});

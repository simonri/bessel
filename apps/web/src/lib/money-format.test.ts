import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Money on these pages is whole kr through Amount, so it reads the same
// everywhere and blurs when amounts are hidden.
const MONEY_PAGES = [
  "components/accounts",
  "components/transactions",
  "routes/_app/accounts.tsx",
  "routes/_app/transactions.tsx",
  "routes/_app/investments.tsx",
  "routes/_app/-holdings-tab.tsx",
  "routes/_app/-trades-tab.tsx",
];

const FORBIDDEN: [RegExp, string][] = [
  [/\bformat(Money|Amount)\b/, "use Amount, or formatKr for plain text"],
  [/\sSEK\b/, "say kr, through Amount or formatKr"],
  [/toLocaleString\(\s*["']sv-SE["']/, "use Amount or formatKr"],
];

const SRC = join(__dirname, "..");

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
}

describe("money format", () => {
  it("money pages show amounts through Amount", () => {
    const offences: string[] = [];
    for (const file of MONEY_PAGES.flatMap((p) => files(join(SRC, p)))) {
      if (!file.endsWith(".tsx") || file.endsWith(".test.tsx")) continue;
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

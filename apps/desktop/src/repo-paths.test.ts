import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insideRepo } from "./repo-paths";

let base: string;
let repo: string;
let outside: string;

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "repo-paths-"));
  repo = path.join(base, "repo");
  outside = path.join(base, "home");
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, ".bashrc"), "mine");
  fs.symlinkSync(outside, path.join(repo, "link"));
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe("insideRepo", () => {
  it("takes the repo's own files, new ones included", () => {
    expect(insideRepo(repo, "src/a.ts")).toBe(path.join(repo, "src/a.ts"));
    expect(insideRepo(repo, "new/dir/b.ts")).toBe(
      path.join(repo, "new/dir/b.ts"),
    );
  });

  it("refuses a path that leaves the repo, by .. or through a symlinked folder", () => {
    expect(insideRepo(repo, "../home/.bashrc")).toBeNull();
    expect(insideRepo(repo, "link/.bashrc")).toBeNull();
    expect(insideRepo(repo, "")).toBeNull();
  });

  it("takes a symlink itself, which removing only unlinks", () => {
    expect(insideRepo(repo, "link")).toBe(path.join(repo, "link"));
  });
});

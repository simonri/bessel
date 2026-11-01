import fs from "node:fs";
import path from "node:path";

/**
 * `file` (relative to the repo) as an absolute path, if it is inside the
 * repository once symlinked folders are followed; null otherwise. Comparing
 * resolved strings alone isn't enough: with a tracked symlink `link -> ~`,
 * `link/.bashrc` resolves inside the repo but reading or deleting it reaches
 * the home folder. The last component may itself be a symlink: deleting that
 * removes the link, not what it points to.
 */
export function insideRepo(repoPath: string, file: string): string | null {
  if (!file || file.includes("\0")) return null;
  const root = path.resolve(repoPath);
  const target = path.resolve(root, file);
  if (!target.startsWith(root + path.sep)) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const realParent = fs.realpathSync(path.dirname(target));
    return realParent === realRoot || realParent.startsWith(realRoot + path.sep)
      ? target
      : null;
  } catch {
    // A parent that doesn't exist can't lead anywhere else.
    return target;
  }
}

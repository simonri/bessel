import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Vault IPC and the vault:// protocol take the root from the renderer, so
// without this list a compromised renderer could read or write any folder
// ("root=/"). Roots are approved only by the main process: a folder the user
// picked in the native dialog, or the default ~/Obsidian Vault.
//
// The list didn't exist before, so the first launch that creates it adopts
// existing Obsidian vaults (folders containing .obsidian) the renderer
// already remembers as recents. Once the file exists, that path is closed.
export class VaultRootRegistry {
  private readonly roots: Set<string>;
  private readonly bootstrapping: boolean;

  constructor(private readonly file: string) {
    this.bootstrapping = !fs.existsSync(file);
    this.roots = new Set(this.load());
  }

  approve(root: string): void {
    const normalized = normalize(root);
    if (!normalized || this.roots.has(normalized)) return;
    this.roots.add(normalized);
    this.save();
  }

  /** Returns `root` unchanged if approved; throws otherwise. */
  assertApproved(root: unknown): string {
    const normalized = normalize(root);
    if (!normalized) throw new Error("Vault root must be an absolute path");
    if (this.roots.has(normalized)) return root as string;
    if (this.bootstrapping && isAdoptableVault(normalized)) {
      this.approve(normalized);
      return root as string;
    }
    throw new Error(
      "Vault folder hasn't been opened through the folder picker",
    );
  }

  private load(): string[] {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed)
        ? parsed.map(normalize).filter((r): r is string => r !== null)
        : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify([...this.roots], null, 2), {
        mode: 0o600,
      });
    } catch {
      // Non-fatal: approvals still hold for this session.
    }
  }
}

function normalize(root: unknown): string | null {
  if (typeof root !== "string" || !path.isAbsolute(root)) return null;
  return path.resolve(root);
}

function isAdoptableVault(root: string): boolean {
  if (root === path.parse(root).root || root === os.homedir()) return false;
  try {
    return fs.statSync(path.join(root, ".obsidian")).isDirectory();
  } catch {
    return false;
  }
}

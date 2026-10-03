import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VaultRootRegistry } from "./vault-roots.js";

describe("VaultRootRegistry", () => {
  let dir: string;
  let file: string;
  let vault: string;
  let plain: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-roots-"));
    file = path.join(dir, "profile", "vault-roots.json");
    vault = path.join(dir, "Vault");
    plain = path.join(dir, "NotAVault");
    fs.mkdirSync(path.join(vault, ".obsidian"), { recursive: true });
    fs.mkdirSync(plain);
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("rejects relative and non-string roots", () => {
    const reg = new VaultRootRegistry(file);
    expect(() => reg.assertApproved("relative/path")).toThrow();
    expect(() => reg.assertApproved(42)).toThrow();
  });

  it("only allows approved roots once the list exists", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "[]");
    const reg = new VaultRootRegistry(file);
    expect(() => reg.assertApproved(vault)).toThrow();
    expect(() => reg.assertApproved("/")).toThrow();
    reg.approve(plain);
    expect(reg.assertApproved(plain)).toBe(plain);
    expect(reg.assertApproved(`${plain}/`)).toBe(`${plain}/`);
  });

  it("persists approvals across restarts", () => {
    new VaultRootRegistry(file).approve(plain);
    expect(new VaultRootRegistry(file).assertApproved(plain)).toBe(plain);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("adopts existing Obsidian vaults only on the first launch", () => {
    const first = new VaultRootRegistry(file);
    expect(first.assertApproved(vault)).toBe(vault);
    expect(() => first.assertApproved(plain)).toThrow();
    expect(() => first.assertApproved("/")).toThrow();

    const other = path.join(dir, "Other");
    fs.mkdirSync(path.join(other, ".obsidian"), { recursive: true });
    const later = new VaultRootRegistry(file);
    expect(later.assertApproved(vault)).toBe(vault);
    expect(() => later.assertApproved(other)).toThrow();
  });
});

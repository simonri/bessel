import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// What `ssh` accepts as a destination here: an optional user, then a host or
// config alias. Aliases may contain underscores, which DNS names can't.
export const SSH_HOST_PATTERN =
  /^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9_][A-Za-z0-9._-]*$/;

const PATTERN_CHARS = /[*?!]/;

export function sshConfigPath(): string {
  return path.join(os.homedir(), ".ssh", "config");
}

/** Host aliases from one config file's text, skipping wildcard patterns. */
export function parseHostAliases(text: string): string[] {
  const hosts: string[] = [];
  for (const line of text.split("\n")) {
    const match = /^\s*host\s+(.+)$/i.exec(line.replace(/#.*/, ""));
    if (!match) continue;
    for (const alias of match[1].trim().split(/\s+/))
      if (!PATTERN_CHARS.test(alias) && SSH_HOST_PATTERN.test(alias))
        hosts.push(alias);
  }
  return hosts;
}

/** `Include` targets in one config file, relative paths resolved from ~/.ssh. */
export function parseIncludes(text: string, sshDir: string): string[] {
  const targets: string[] = [];
  for (const line of text.split("\n")) {
    const match = /^\s*include\s+(.+)$/i.exec(line.replace(/#.*/, ""));
    if (!match) continue;
    for (const raw of match[1].trim().split(/\s+/)) {
      const expanded = raw.startsWith("~/")
        ? path.join(os.homedir(), raw.slice(2))
        : raw;
      targets.push(path.resolve(sshDir, expanded));
    }
  }
  return targets;
}

// Include allows globs; a `*` in the file name is all that's used in practice.
function expandInclude(target: string): string[] {
  const base = path.basename(target);
  if (!base.includes("*")) return [target];
  const dir = path.dirname(target);
  const re = new RegExp(
    `^${base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
  );
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => re.test(name))
      .sort()
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Hosts from ~/.ssh/config and the files it includes (one level deep). */
export function listConfiguredHosts(configPath = sshConfigPath()): string[] {
  const text = readText(configPath);
  if (text === null) return [];
  const sshDir = path.dirname(configPath);
  const hosts = parseHostAliases(text);
  for (const target of parseIncludes(text, sshDir))
    for (const file of expandInclude(target)) {
      const included = readText(file);
      if (included !== null) hosts.push(...parseHostAliases(included));
    }
  return [...new Set(hosts)];
}

/** A single folder name to create: no separators, nothing special. */
export function isValidFolderName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    name !== "." &&
    name !== ".." &&
    !/[/\0]/.test(name)
  );
}

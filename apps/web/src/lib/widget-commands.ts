// Terminal/claudeCode WindowEntry.data values must be strings, so a queued
// list of commands to run on spawn is JSON-encoded under the "commands" key.

export function encodeCommands(commands: string[]): string | undefined {
  const clean = commands.map((c) => c.trim()).filter(Boolean);
  return clean.length ? JSON.stringify(clean) : undefined;
}

export function decodeCommands(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

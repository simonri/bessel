import { userStorage } from "@/lib/user-storage";

const KEY = "bessel:claude-session-boards";
const MAX_REMEMBERED = 200;

function read(): Record<string, string> {
  try {
    const parsed = JSON.parse(userStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The canvas session a Claude session was last shown in, so reopening it
 * returns there instead of starting yet another canvas session.
 */
export function lastBoardOf(sessionKey: string): string | undefined {
  return read()[sessionKey];
}

export function rememberBoard(sessionKey: string, workspaceId: string): void {
  const boards = read();
  if (boards[sessionKey] === workspaceId) return;
  delete boards[sessionKey];
  boards[sessionKey] = workspaceId;
  const keys = Object.keys(boards);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED)))
    delete boards[old];
  userStorage.setItem(KEY, JSON.stringify(boards));
}

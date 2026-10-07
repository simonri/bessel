import { toast } from "sonner";

/**
 * Per-user localStorage. Every user-owned key is namespaced by the Auth0
 * subject (`bessel:user:<sub>:<name>`), so two accounts on one device never
 * see each other's canvas, settings or caches.
 *
 * Keys are passed as their pre-scoping names (e.g. `bessel:workspaces`). Until
 * a user is activated those names are used as-is — only tests and pre-auth
 * code run in that state, since `/_app` activates before mounting anything
 * that persists. After an explicit logout the scope is locked: reads return
 * nothing and writes are dropped, so late flushes (pagehide, debounces) can't
 * write the cleared data back.
 */

const SCOPE_PREFIX = "bessel:user:";
const MIGRATED_KEY = "bessel:storage-migrated";
const FORCE_LOGIN_PROMPT_KEY = "bessel:force-login-prompt";

/** Unscoped keys that predate per-user storage; claimed by the first user. */
const LEGACY_KEYS = [
  "bessel:workspaces",
  "bessel:settings",
  "bessel:workspace-templates",
  "bessel:projectsCache",
  "bessel:collapsedProjects",
  "bessel:sidebarWidth",
  "bessel:activePage",
  "bessel:calendar-default",
  "bessel:calendar-reminders-sent",
  "metron:windows",
  "metron:settings",
  "metron:workspace-templates",
];
const LEGACY_PREFIXES = ["bessel:obsidian:"];

type Scope =
  | { kind: "unscoped" }
  | { kind: "user"; prefix: string }
  | { kind: "locked" };

let scope: Scope = { kind: "unscoped" };

function scopedName(key: string): string {
  return key.startsWith("bessel:") ? key.slice("bessel:".length) : key;
}

function resolve(key: string): string | null {
  if (scope.kind === "locked") return null;
  if (scope.kind === "unscoped") return key;
  return `${scope.prefix}${scopedName(key)}`;
}

function isLegacyKey(key: string): boolean {
  return (
    LEGACY_KEYS.includes(key) ||
    LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

function migrateLegacyKeys(prefix: string) {
  const legacy: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isLegacyKey(key)) legacy.push(key);
  }
  for (const key of legacy) {
    const value = localStorage.getItem(key);
    const target = `${prefix}${scopedName(key)}`;
    if (value !== null && localStorage.getItem(target) === null)
      localStorage.setItem(target, value);
    localStorage.removeItem(key);
  }
}

/**
 * Binds storage to `sub`. The first user to log in on this device inherits
 * whatever unscoped data predates per-user storage; later users start clean.
 * Idempotent — safe to call on every render.
 */
export function activateUserStorage(sub: string) {
  const prefix = `${SCOPE_PREFIX}${encodeURIComponent(sub)}:`;
  if (scope.kind === "user" && scope.prefix === prefix) return;
  scope = { kind: "user", prefix };
  try {
    if (localStorage.getItem(MIGRATED_KEY) === null) {
      migrateLegacyKeys(prefix);
      localStorage.setItem(MIGRATED_KEY, "1");
    }
    localStorage.removeItem(FORCE_LOGIN_PROMPT_KEY);
  } catch {}
}

/**
 * Wipes the active user's data (and any unclaimed legacy data) and locks
 * storage until the next activation. Call on explicit logout, before
 * redirecting to Auth0; the next login is then forced through the login
 * screen instead of silently reusing the identity provider's session.
 */
export function clearUserStorage() {
  const prefix = scope.kind === "user" ? scope.prefix : null;
  scope = { kind: "locked" };
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && ((prefix && key.startsWith(prefix)) || isLegacyKey(key)))
        doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
    localStorage.setItem(FORCE_LOGIN_PROMPT_KEY, "1");
  } catch {}
}

/** Whether the last session ended in an explicit logout. */
export function shouldForceLoginPrompt(): boolean {
  try {
    return localStorage.getItem(FORCE_LOGIN_PROMPT_KEY) !== null;
  } catch {
    return false;
  }
}

/** The storage key `key` currently maps to, or null while storage is locked. */
export function userStorageKey(key: string): string | null {
  return resolve(key);
}

let quotaToastShown = false;

function reportWriteFailure(error: unknown) {
  const quota =
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED");
  if (!quota || quotaToastShown) return;
  quotaToastShown = true;
  toast.error("Storage is full - recent changes won't be saved on this device");
}

export const userStorage = {
  getItem(key: string): string | null {
    const resolved = resolve(key);
    if (resolved === null) return null;
    try {
      return localStorage.getItem(resolved);
    } catch {
      return null;
    }
  },

  /** Returns false when the write failed; a full quota toasts once per session. */
  setItem(key: string, value: string): boolean {
    const resolved = resolve(key);
    if (resolved === null) return true;
    try {
      localStorage.setItem(resolved, value);
      return true;
    } catch (error) {
      reportWriteFailure(error);
      return false;
    }
  },

  removeItem(key: string) {
    const resolved = resolve(key);
    if (resolved === null) return;
    try {
      localStorage.removeItem(resolved);
    } catch {}
  },
};

/** Test-only: back to the unscoped state. */
export function resetUserStorageForTests() {
  scope = { kind: "unscoped" };
  quotaToastShown = false;
}

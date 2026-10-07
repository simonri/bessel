// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import {
  activateUserStorage,
  clearUserStorage,
  resetUserStorageForTests,
  shouldForceLoginPrompt,
  userStorage,
  userStorageKey,
} from "./user-storage";

// This environment's global `localStorage` is a broken Node stub (no clear/removeItem),
// not jsdom's Storage implementation — replace it with a real in-memory one for these tests.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
}

Object.defineProperty(window, "localStorage", {
  value: memoryStorage(),
  configurable: true,
});

const ALICE = "auth0|alice";
const BOB = "google-oauth2|bob";

beforeEach(() => {
  window.localStorage.clear();
  resetUserStorageForTests();
  toastError.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scoping", () => {
  it("namespaces keys by the active user", () => {
    activateUserStorage(ALICE);
    userStorage.setItem("bessel:workspaces", "alice-canvas");

    expect(userStorageKey("bessel:workspaces")).toBe(
      "bessel:user:auth0%7Calice:workspaces",
    );
    expect(
      window.localStorage.getItem("bessel:user:auth0%7Calice:workspaces"),
    ).toBe("alice-canvas");
    expect(window.localStorage.getItem("bessel:workspaces")).toBeNull();

    activateUserStorage(BOB);
    expect(userStorage.getItem("bessel:workspaces")).toBeNull();
  });

  it("uses keys as-is before any user is active", () => {
    userStorage.setItem("bessel:settings", "{}");
    expect(window.localStorage.getItem("bessel:settings")).toBe("{}");
  });
});

describe("migration", () => {
  it("hands unscoped data to the first user only", () => {
    window.localStorage.setItem("bessel:workspaces", "old-canvas");
    window.localStorage.setItem("bessel:obsidian:/notes", "vault-ui");
    window.localStorage.setItem("metron:settings", "legacy-settings");
    window.localStorage.setItem("bessel:calendar-timezone", "Europe/Oslo");

    activateUserStorage(ALICE);

    expect(userStorage.getItem("bessel:workspaces")).toBe("old-canvas");
    expect(userStorage.getItem("bessel:obsidian:/notes")).toBe("vault-ui");
    expect(userStorage.getItem("metron:settings")).toBe("legacy-settings");
    expect(window.localStorage.getItem("bessel:workspaces")).toBeNull();
    expect(window.localStorage.getItem("metron:settings")).toBeNull();
    // Device-level preferences aren't user data.
    expect(window.localStorage.getItem("bessel:calendar-timezone")).toBe(
      "Europe/Oslo",
    );

    // Even if unscoped data shows up again, a later user never inherits it.
    window.localStorage.setItem("bessel:workspaces", "stray");
    activateUserStorage(BOB);
    expect(userStorage.getItem("bessel:workspaces")).toBeNull();
  });

  it("never overwrites data the user already has", () => {
    window.localStorage.setItem(
      "bessel:user:auth0%7Calice:settings",
      "current",
    );
    window.localStorage.setItem("bessel:settings", "stale");

    activateUserStorage(ALICE);

    expect(userStorage.getItem("bessel:settings")).toBe("current");
  });
});

describe("clearUserStorage", () => {
  it("wipes only the active user's data and forces the login screen next time", () => {
    activateUserStorage(BOB);
    userStorage.setItem("bessel:workspaces", "bob-canvas");
    activateUserStorage(ALICE);
    userStorage.setItem("bessel:workspaces", "alice-canvas");
    userStorage.setItem("bessel:obsidian:/notes", "vault-ui");

    clearUserStorage();

    expect(
      window.localStorage.getItem("bessel:user:auth0%7Calice:workspaces"),
    ).toBeNull();
    expect(
      window.localStorage.getItem("bessel:user:auth0%7Calice:obsidian:/notes"),
    ).toBeNull();
    expect(
      window.localStorage.getItem("bessel:user:google-oauth2%7Cbob:workspaces"),
    ).toBe("bob-canvas");
    expect(shouldForceLoginPrompt()).toBe(true);

    // A re-render before the logout redirect must not unlock storage.
    activateUserStorage(ALICE);
    userStorage.setItem("bessel:workspaces", "late-write");
    expect(
      window.localStorage.getItem("bessel:user:auth0%7Calice:workspaces"),
    ).toBeNull();
    expect(shouldForceLoginPrompt()).toBe(true);

    // The next page load's sign-in clears the forced prompt.
    resetUserStorageForTests();
    activateUserStorage(ALICE);
    expect(shouldForceLoginPrompt()).toBe(false);
  });

  it("locks when another tab logs out", () => {
    activateUserStorage(ALICE);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "bessel:force-login-prompt",
        newValue: "1",
      }),
    );

    userStorage.setItem("bessel:workspaces", "stale-tab");

    expect(
      window.localStorage.getItem("bessel:user:auth0%7Calice:workspaces"),
    ).toBeNull();
  });

  it("drops writes that land after logout (pagehide flushes, debounces)", () => {
    activateUserStorage(ALICE);
    clearUserStorage();

    userStorage.setItem("bessel:workspaces", "late-flush");

    expect(userStorage.getItem("bessel:workspaces")).toBeNull();
    const keys = Array.from({ length: window.localStorage.length }, (_, i) =>
      window.localStorage.key(i),
    );
    expect(keys).toEqual([
      "bessel:storage-migrated",
      "bessel:force-login-prompt",
    ]);
  });
});

describe("write failures", () => {
  it("reports a full quota once instead of throwing", () => {
    activateUserStorage(ALICE);
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(userStorage.setItem("bessel:workspaces", "x")).toBe(false);
    expect(userStorage.setItem("bessel:settings", "y")).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});

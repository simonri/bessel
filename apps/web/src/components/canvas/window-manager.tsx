import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Layout as RglLayout, verticalCompactor } from "react-grid-layout";
import { toast } from "sonner";
import {
  type Box,
  type EngineItem,
  fitToViewport,
  placeWithShrink,
  sanitizeLayout,
} from "./layout-engine";
import { MODULE_REGISTRY } from "./module-registry";

export type ModuleKey =
  | "dashboard"
  | "transactions"
  | "accounts"
  | "investments"
  | "tasks"
  | "travel"
  | "activity"
  | "recipes"
  | "claudeCode"
  | "codex"
  | "grok"
  | "terminal"
  | "gitStatus"
  | "browser";

export const GRID_COLS = 24;
export const GRID_ROW_HEIGHT = 32;

// Hygiene ceiling for persisted coordinates — far taller than any real screen,
// only there so corrupted data can't park a widget thousands of rows down.
const MAX_STORED_ROWS = 500;

export type WindowEntry = {
  id: string;
  module: ModuleKey;
  x: number;
  y: number;
  w: number;
  h: number;
  data?: Record<string, string>;
  workspaceId: string;
};

export type WindowSpec = { module: ModuleKey; data?: Record<string, string> };

interface WorkspaceMeta {
  id: string;
}

// Split into four contexts so consumers only re-render for the state they
// actually read: the action callbacks are all stable, so components that only
// dispatch (dock buttons, terminal/browser widgets, title-bar buttons) never
// re-render from window churn at all; workspace meta changes only on
// add/remove/switch; the flash marker is consumed by a single pill.
interface WindowManagerActions {
  /** How many grid rows fit the viewport right now — placement and layout sanitizing honor it. */
  setViewportRows: (rows: number) => void;
  /** Returns false (and toasts) when the workspace has no room, even after shrinking to minSize. */
  toggleWindow: (module: ModuleKey) => boolean;
  /** Returns false (and toasts) when the workspace has no room, even after shrinking to minSize. */
  openWindow: (module: ModuleKey, data?: Record<string, string>) => boolean;
  closeWindow: (id: string) => void;
  /** Merges `patch` into a window's per-instance data — e.g. a browser widget saving its current URL. */
  updateWindowData: (windowId: string, patch: Record<string, string>) => void;
  /** Writes a react-grid-layout `Layout` (from drag/resize stop) back into the given workspace's windows. */
  updateLayout: (workspaceId: string, layout: RglLayout) => void;
  /** Vertically compacts the active workspace's windows into the current viewport, removing gaps. */
  alignWorkspace: () => void;
  /** Returns false (and toasts) when the target workspace has no room for the window. */
  moveWindowToWorkspace: (
    windowId: string,
    targetWorkspaceId: string,
  ) => boolean;
  /** Opens a batch of windows at once; widgets that don't fit are skipped and reported. */
  applyTemplate: (
    specs: WindowSpec[],
    target: "current" | "new",
  ) => { opened: number; skipped: number };
  addWorkspace: () => void;
  removeWorkspace: (id: string) => void;
  switchWorkspace: (id: string) => void;
}

interface WindowManagerState {
  /** Windows in the active workspace only. */
  windows: WindowEntry[];
  /** Every window across every workspace — stable identity, used for flat/always-mounted rendering. */
  allWindows: WindowEntry[];
  /**
   * Per-workspace window arrays whose identity is preserved when that
   * workspace's windows didn't change — what lets a memoized grid skip
   * re-rendering while a sibling workspace is being rearranged.
   */
  windowsByWorkspace: ReadonlyMap<string, WindowEntry[]>;
  isOpen: (module: ModuleKey) => boolean;
}

interface WorkspaceMetaState {
  workspaces: WorkspaceMeta[];
  activeWorkspaceId: string;
}

interface WindowManagerContextValue
  extends WindowManagerActions,
    WindowManagerState,
    WorkspaceMetaState {
  /** Workspace a window was just moved into, briefly set so the UI can flash it. */
  flashWorkspaceId: string | null;
}

export const WindowEntryContext = createContext<WindowEntry | null>(null);

export function useWindowEntry() {
  return useContext(WindowEntryContext);
}

export const WindowTitleContext = createContext<
  ((title: string | null) => void) | null
>(null);

export function useWindowTitle() {
  return useContext(WindowTitleContext);
}

const STORAGE_KEY = "bessel:workspaces";
const LEGACY_KEY = "metron:windows";

const isDesktop = typeof window !== "undefined" && !!window.electron;

const ALL_MODULES = new Set<string>([
  "dashboard",
  "transactions",
  "accounts",
  "investments",
  "tasks",
  "travel",
  "activity",
  "recipes",
  "gitStatus",
  ...(isDesktop ? ["claudeCode", "codex", "grok", "terminal", "browser"] : []),
]);

function newId() {
  return (
    crypto.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function toRglLayout(windows: WindowEntry[]): RglLayout {
  return windows.map((win) => ({
    i: win.id,
    x: win.x,
    y: win.y,
    w: win.w,
    h: win.h,
  }));
}

function toEngineItems(windows: WindowEntry[]): EngineItem[] {
  return windows.map((win) => {
    const { minSize } = MODULE_REGISTRY[win.module];
    return {
      x: win.x,
      y: win.y,
      w: win.w,
      h: win.h,
      minW: minSize.w,
      minH: minSize.h,
    };
  });
}

/** Zips engine output back onto windows, preserving object identity where nothing moved. */
function withEngineBoxes(
  windows: WindowEntry[],
  boxes: readonly Box[],
): WindowEntry[] {
  return windows.map((win, i) => {
    const box = boxes[i];
    return win.x === box.x &&
      win.y === box.y &&
      win.w === box.w &&
      win.h === box.h
      ? win
      : { ...win, x: box.x, y: box.y, w: box.w, h: box.h };
  });
}

function placeNewWidget(
  existing: WindowEntry[],
  module: ModuleKey,
  maxRows: number,
): Box | null {
  const { defaultSize, minSize } = MODULE_REGISTRY[module];
  return placeWithShrink(existing, defaultSize, minSize, GRID_COLS, maxRows);
}

function toastNoRoom(module: ModuleKey) {
  toast.warning(
    `No room for ${MODULE_REGISTRY[module].title} — free up space or close a widget`,
  );
}

// The old 2-column, fixed 1x1-cell layout: `col = slot % 2`, `row = floor(slot / 2)`.
// Replicated onto the finer grid so upgraded users see roughly the same left/right,
// top/bottom arrangement — lossy (old data had no size info), but order is preserved.
function migrateSlot(
  slot: number,
  module: ModuleKey,
): { x: number; y: number; w: number; h: number } {
  const { w, h } = MODULE_REGISTRY[module].defaultSize;
  const col = slot % 2;
  const row = Math.floor(slot / 2);
  return {
    x: col * (GRID_COLS / 2),
    y: row * h,
    w: Math.min(w, GRID_COLS / 2),
    h,
  };
}

type StoredWindowNew = {
  module: string;
  x: number;
  y: number;
  w: number;
  h: number;
  data?: Record<string, string>;
};
type StoredWindowLegacy = {
  module: string;
  slot: number;
  data?: Record<string, string>;
};
type StoredWindow = StoredWindowNew | StoredWindowLegacy;

function isNewFormat(e: StoredWindow): e is StoredWindowNew {
  return (
    Number.isFinite((e as StoredWindowNew).x) &&
    Number.isFinite((e as StoredWindowNew).y) &&
    Number.isFinite((e as StoredWindowNew).w) &&
    Number.isFinite((e as StoredWindowNew).h)
  );
}

function parseWindows(raw: unknown[], workspaceId: string): WindowEntry[] {
  const entries = (raw as StoredWindow[]).filter(
    (e) => e && typeof e === "object" && ALL_MODULES.has(e.module),
  );

  let migrated = false;
  const result: WindowEntry[] = [];
  for (const e of entries) {
    const module = e.module as ModuleKey;
    if (isNewFormat(e)) {
      result.push({
        id: newId(),
        module,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        data: e.data,
        workspaceId,
      });
    } else if (typeof (e as StoredWindowLegacy).slot === "number") {
      migrated = true;
      const { x, y, w, h } = migrateSlot(
        (e as StoredWindowLegacy).slot,
        module,
      );
      result.push({
        id: newId(),
        module,
        x,
        y,
        w,
        h,
        data: e.data,
        workspaceId,
      });
    }
  }

  // Clamping w down to fit the old 2-column layout onto this grid can introduce
  // overlap — clean it up, but only when a migration actually happened, so
  // already-current-format data is never silently rearranged on load.
  let windows = result;
  if (migrated) {
    const compacted = verticalCompactor.compact(toRglLayout(result), GRID_COLS);
    windows = result.map((win) => {
      const item = compacted.find((l) => l.i === win.id)!;
      return { ...win, x: item.x, y: item.y };
    });
  }

  // Untrusted storage: force everything in bounds. Valid windows are never
  // moved by this; viewport-height fitting happens at render time instead.
  const { items, changed } = sanitizeLayout(
    toEngineItems(windows),
    GRID_COLS,
    MAX_STORED_ROWS,
  );
  return changed ? withEngineBoxes(windows, items) : windows;
}

interface LoadedState {
  workspaces: WorkspaceMeta[];
  windows: WindowEntry[];
  activeWorkspaceId: string;
}

function loadState(): LoadedState {
  // Try current workspaces format
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        workspaces: Array<{ id: string; windows: StoredWindow[] }>;
        activeWorkspaceId: string;
      };
      if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
        const workspaces = parsed.workspaces.map((ws) => ({ id: ws.id }));
        const windows = parsed.workspaces.flatMap((ws) =>
          parseWindows(ws.windows ?? [], ws.id),
        );
        const activeId =
          workspaces.find((ws) => ws.id === parsed.activeWorkspaceId)?.id ??
          workspaces[0].id;
        return { workspaces, windows, activeWorkspaceId: activeId };
      }
    }
  } catch {}

  // Migrate from legacy flat-windows format
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const id = newId();
      const windows = parseWindows(JSON.parse(legacyRaw) as unknown[], id);
      return { workspaces: [{ id }], windows, activeWorkspaceId: id };
    }
  } catch {}

  // Default: one empty workspace
  const id = newId();
  return { workspaces: [{ id }], windows: [], activeWorkspaceId: id };
}

const WindowActionsContext = createContext<WindowManagerActions | null>(null);
const WindowStateContext = createContext<WindowManagerState | null>(null);
const WorkspaceMetaContext = createContext<WorkspaceMetaState | null>(null);
const FlashWorkspaceContext = createContext<string | null>(null);

const NO_WINDOWS: WindowEntry[] = [];

const PERSIST_DEBOUNCE_MS = 300;

export function WindowManager({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(loadState);
  // Authoritative mirror of `state`, so actions can read-then-commit synchronously
  // (and fire toasts outside React updaters) without racing the render cycle.
  const stateRef = useRef(state);
  const viewportRowsRef = useRef(Number.POSITIVE_INFINITY);
  const { workspaces, windows: allWindows, activeWorkspaceId } = state;
  const [flashWorkspaceId, setFlashWorkspaceId] = useState<string | null>(null);

  const commit = useCallback((updater: (prev: LoadedState) => LoadedState) => {
    const next = updater(stateRef.current);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  const setViewportRows = useCallback((rows: number) => {
    viewportRowsRef.current =
      Number.isFinite(rows) && rows > 0 ? rows : Number.POSITIVE_INFINITY;
  }, []);

  // Actions preserve object identity for untouched windows, so an unchanged
  // workspace can keep its previous array — memoized grids then skip entirely
  // while a sibling workspace is being rearranged.
  const windowsByWorkspaceRef = useRef<Map<string, WindowEntry[]> | null>(null);
  const windowsByWorkspace = useMemo(() => {
    const next = new Map<string, WindowEntry[]>();
    for (const ws of workspaces) next.set(ws.id, []);
    for (const win of allWindows) next.get(win.workspaceId)?.push(win);
    const prev = windowsByWorkspaceRef.current;
    if (prev) {
      for (const [id, arr] of next) {
        const old = prev.get(id);
        if (
          old &&
          old.length === arr.length &&
          old.every((w, i) => w === arr[i])
        )
          next.set(id, old);
      }
    }
    windowsByWorkspaceRef.current = next;
    return next;
  }, [workspaces, allWindows]);

  const windows = windowsByWorkspace.get(activeWorkspaceId) ?? NO_WINDOWS;

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistNow = useCallback(() => {
    if (persistTimerRef.current !== null) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const current = stateRef.current;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        workspaces: current.workspaces.map((ws) => ({
          id: ws.id,
          windows: current.windows
            .filter((w) => w.workspaceId === ws.id)
            .map((win) => ({
              module: win.module,
              x: win.x,
              y: win.y,
              w: win.w,
              h: win.h,
              ...(win.data ? { data: win.data } : {}),
            })),
        })),
        activeWorkspaceId: current.activeWorkspaceId,
      }),
    );
  }, []);

  // Debounced: commits arrive in bursts (drag stops, a browser widget saving
  // its URL per navigation), and serializing every workspace synchronously on
  // each one would block the interaction path.
  useEffect(() => {
    if (persistTimerRef.current !== null) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
  }, [state, persistNow]);

  useEffect(() => {
    const flush = () => {
      if (persistTimerRef.current !== null) persistNow();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persistNow]);

  useEffect(() => {
    if (!flashWorkspaceId) return;
    const t = setTimeout(() => setFlashWorkspaceId(null), 900);
    return () => clearTimeout(t);
  }, [flashWorkspaceId]);

  const isOpen = useCallback(
    (module: ModuleKey) => windows.some((w) => w.module === module),
    [windows],
  );

  const toggleWindow = useCallback(
    (module: ModuleKey): boolean => {
      const prev = stateRef.current;
      const activeId = prev.activeWorkspaceId;
      const active = prev.windows.filter((w) => w.workspaceId === activeId);
      if (active.some((w) => w.module === module)) {
        commit((p) => ({
          ...p,
          windows: p.windows.filter(
            (w) => !(w.workspaceId === activeId && w.module === module),
          ),
        }));
        return true;
      }
      const placed = placeNewWidget(active, module, viewportRowsRef.current);
      if (!placed) {
        toastNoRoom(module);
        return false;
      }
      const entry: WindowEntry = {
        id: newId(),
        module,
        ...placed,
        workspaceId: activeId,
      };
      commit((p) => ({ ...p, windows: [...p.windows, entry] }));
      return true;
    },
    [commit],
  );

  const openWindow = useCallback(
    (module: ModuleKey, data?: Record<string, string>): boolean => {
      const prev = stateRef.current;
      const activeId = prev.activeWorkspaceId;
      const active = prev.windows.filter((w) => w.workspaceId === activeId);
      const placed = placeNewWidget(active, module, viewportRowsRef.current);
      if (!placed) {
        toastNoRoom(module);
        return false;
      }
      const entry: WindowEntry = {
        id: newId(),
        module,
        ...placed,
        data,
        workspaceId: activeId,
      };
      commit((p) => ({ ...p, windows: [...p.windows, entry] }));
      return true;
    },
    [commit],
  );

  const closeWindow = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        windows: prev.windows.filter((w) => w.id !== id),
      }));
    },
    [commit],
  );

  // Windows in every workspace stay mounted (see CanvasShell), so data/layout
  // updates target windows by id/workspaceId — not just the active workspace.
  const updateWindowData = useCallback(
    (windowId: string, patch: Record<string, string>) => {
      commit((prev) => ({
        ...prev,
        windows: prev.windows.map((w) =>
          w.id === windowId ? { ...w, data: { ...w.data, ...patch } } : w,
        ),
      }));
    },
    [commit],
  );

  const updateLayout = useCallback(
    (workspaceId: string, layout: RglLayout) => {
      commit((prev) => {
        let touched = false;
        const merged = prev.windows.map((win) => {
          if (win.workspaceId !== workspaceId) return win;
          const item = layout.find((l) => l.i === win.id);
          if (
            !item ||
            (item.x === win.x &&
              item.y === win.y &&
              item.w === win.w &&
              item.h === win.h)
          )
            return win;
          touched = true;
          return { ...win, x: item.x, y: item.y, w: item.w, h: item.h };
        });
        // Safety net: the drag-time compactor has no row cap, so a spring-back
        // can shove a neighbor below the fold — pull it back before persisting.
        const wsWindows = merged.filter((w) => w.workspaceId === workspaceId);
        const { items, changed } = sanitizeLayout(
          toEngineItems(wsWindows),
          GRID_COLS,
          viewportRowsRef.current,
        );
        if (!touched && !changed) return prev;
        if (!changed) return { ...prev, windows: merged };
        const fixed = withEngineBoxes(wsWindows, items);
        let idx = 0;
        return {
          ...prev,
          windows: merged.map((w) =>
            w.workspaceId === workspaceId ? fixed[idx++] : w,
          ),
        };
      });
    },
    [commit],
  );

  const alignWorkspace = useCallback(() => {
    commit((prev) => {
      const activeId = prev.activeWorkspaceId;
      const active = prev.windows.filter((w) => w.workspaceId === activeId);
      if (active.length === 0) return prev;
      const compacted = verticalCompactor.compact(
        toRglLayout(active),
        GRID_COLS,
      );
      const moved = active.map((win) => {
        const item = compacted.find((l) => l.i === win.id)!;
        return item.x === win.x && item.y === win.y
          ? win
          : { ...win, x: item.x, y: item.y };
      });
      const fitted = fitToViewport(
        toEngineItems(moved),
        GRID_COLS,
        viewportRowsRef.current,
      );
      const finalWindows = withEngineBoxes(moved, fitted);
      if (finalWindows.every((w, i) => w === active[i])) return prev;
      let idx = 0;
      return {
        ...prev,
        windows: prev.windows.map((w) =>
          w.workspaceId === activeId ? finalWindows[idx++] : w,
        ),
      };
    });
  }, [commit]);

  const moveWindowToWorkspace = useCallback(
    (windowId: string, targetWorkspaceId: string): boolean => {
      const prev = stateRef.current;
      const moving = prev.windows.find((w) => w.id === windowId);
      if (!moving || moving.workspaceId === targetWorkspaceId) return false;
      if (!prev.workspaces.some((ws) => ws.id === targetWorkspaceId))
        return false;
      const targetWindows = prev.windows.filter(
        (w) => w.workspaceId === targetWorkspaceId,
      );
      const { minSize } = MODULE_REGISTRY[moving.module];
      // Current size first — the window only shrinks if the target is tight.
      const placed = placeWithShrink(
        targetWindows,
        { w: moving.w, h: moving.h },
        minSize,
        GRID_COLS,
        viewportRowsRef.current,
      );
      if (!placed) {
        toast.warning("No room in that workspace — free up space there first");
        return false;
      }
      commit((p) => ({
        ...p,
        windows: p.windows.map((w) =>
          w.id === windowId
            ? { ...w, workspaceId: targetWorkspaceId, ...placed }
            : w,
        ),
      }));
      setFlashWorkspaceId(targetWorkspaceId);
      return true;
    },
    [commit],
  );

  const applyTemplate = useCallback(
    (
      specs: WindowSpec[],
      target: "current" | "new",
    ): { opened: number; skipped: number } => {
      const prev = stateRef.current;
      const workspaceId = target === "new" ? newId() : prev.activeWorkspaceId;
      const existing =
        target === "new"
          ? []
          : prev.windows.filter((w) => w.workspaceId === workspaceId);
      const added: WindowEntry[] = [];
      let skipped = 0;
      for (const spec of specs) {
        const placed = placeNewWidget(
          [...existing, ...added],
          spec.module,
          viewportRowsRef.current,
        );
        if (!placed) {
          skipped += 1;
          continue;
        }
        added.push({
          id: newId(),
          module: spec.module,
          ...placed,
          data: spec.data,
          workspaceId,
        });
      }
      if (target === "new") {
        commit((p) => ({
          workspaces: [...p.workspaces, { id: workspaceId }],
          windows: [...p.windows, ...added],
          activeWorkspaceId: workspaceId,
        }));
      } else if (added.length > 0) {
        commit((p) => ({ ...p, windows: [...p.windows, ...added] }));
      }
      if (skipped > 0) {
        toast.warning(
          `Opened ${added.length} of ${specs.length} widgets — no room for the rest`,
        );
      }
      return { opened: added.length, skipped };
    },
    [commit],
  );

  const addWorkspace = useCallback(() => {
    const id = newId();
    commit((prev) => ({
      ...prev,
      workspaces: [...prev.workspaces, { id }],
      activeWorkspaceId: id,
    }));
  }, [commit]);

  const switchWorkspace = useCallback(
    (id: string) => {
      commit((prev) => ({ ...prev, activeWorkspaceId: id }));
    },
    [commit],
  );

  const removeWorkspace = useCallback(
    (id: string) => {
      commit((prev) => {
        if (prev.workspaces.length <= 1) return prev;
        const remaining = prev.workspaces.filter((ws) => ws.id !== id);
        const activeId =
          prev.activeWorkspaceId === id
            ? (remaining[remaining.length - 1]?.id ?? remaining[0].id)
            : prev.activeWorkspaceId;
        return {
          workspaces: remaining,
          windows: prev.windows.filter((w) => w.workspaceId !== id),
          activeWorkspaceId: activeId,
        };
      });
    },
    [commit],
  );

  // All callbacks are stable ([commit]/[] deps), so this value never changes —
  // action-only consumers never re-render from window churn.
  const actions = useMemo(
    () => ({
      setViewportRows,
      toggleWindow,
      openWindow,
      closeWindow,
      updateWindowData,
      updateLayout,
      alignWorkspace,
      moveWindowToWorkspace,
      applyTemplate,
      addWorkspace,
      removeWorkspace,
      switchWorkspace,
    }),
    [
      setViewportRows,
      toggleWindow,
      openWindow,
      closeWindow,
      updateWindowData,
      updateLayout,
      alignWorkspace,
      moveWindowToWorkspace,
      applyTemplate,
      addWorkspace,
      removeWorkspace,
      switchWorkspace,
    ],
  );

  const stateValue = useMemo(
    () => ({ windows, allWindows, windowsByWorkspace, isOpen }),
    [windows, allWindows, windowsByWorkspace, isOpen],
  );

  const metaValue = useMemo(
    () => ({ workspaces, activeWorkspaceId }),
    [workspaces, activeWorkspaceId],
  );

  return (
    <WindowActionsContext.Provider value={actions}>
      <WorkspaceMetaContext.Provider value={metaValue}>
        <WindowStateContext.Provider value={stateValue}>
          <FlashWorkspaceContext.Provider value={flashWorkspaceId}>
            {children}
          </FlashWorkspaceContext.Provider>
        </WindowStateContext.Provider>
      </WorkspaceMetaContext.Provider>
    </WindowActionsContext.Provider>
  );
}

export function useWindowActions(): WindowManagerActions {
  const ctx = useContext(WindowActionsContext);
  if (!ctx)
    throw new Error("useWindowActions must be used within WindowManager");
  return ctx;
}

export function useWindowState(): WindowManagerState {
  const ctx = useContext(WindowStateContext);
  if (!ctx) throw new Error("useWindowState must be used within WindowManager");
  return ctx;
}

export function useWorkspaceMeta(): WorkspaceMetaState {
  const ctx = useContext(WorkspaceMetaContext);
  if (!ctx)
    throw new Error("useWorkspaceMeta must be used within WindowManager");
  return ctx;
}

export function useFlashWorkspace(): string | null {
  return useContext(FlashWorkspaceContext);
}

/**
 * Whether this widget's workspace is the one currently on screen. Inactive
 * workspaces stay mounted (display:none), so polling widgets use this to
 * suspend their refetch intervals while hidden. Defaults to visible when
 * rendered outside a window/manager (e.g. as a plain route).
 */
export function useWindowVisible(): boolean {
  const entry = useContext(WindowEntryContext);
  const meta = useContext(WorkspaceMetaContext);
  return (
    entry == null ||
    meta == null ||
    entry.workspaceId === meta.activeWorkspaceId
  );
}

/**
 * Combined view over all four contexts — subscribes to everything, so it
 * re-renders on any change. Fine for tests and rarely-rendered dialogs;
 * hot-path components should use the granular hooks above instead.
 */
export function useWindowManager(): WindowManagerContextValue {
  const actions = useWindowActions();
  const state = useWindowState();
  const meta = useWorkspaceMeta();
  const flashWorkspaceId = useFlashWorkspace();
  return useMemo(
    () => ({ ...actions, ...state, ...meta, flashWorkspaceId }),
    [actions, state, meta, flashWorkspaceId],
  );
}

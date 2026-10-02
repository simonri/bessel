import { useCallback, useEffect, useState } from "react";

export type NoteMode = "edit" | "reading";

/** Per-vault UI state, persisted under `bessel:obsidian:<root>`. */
export interface VaultUiState {
  /** Open tabs (note rels) in order. */
  tabs: string[];
  /** Active tab rel; must be in `tabs` (or null when nothing is open). */
  activeTab: string | null;
  mode: NoteMode;
  expandedDirs: string[];
  /** Whether the right-hand (backlinks/outline) panel is shown. */
  sidePanel: "backlinks" | "outline" | null;
}

export const DEFAULT_VAULT_UI_STATE: VaultUiState = {
  tabs: [],
  activeTab: null,
  mode: "edit",
  expandedDirs: [],
  sidePanel: null,
};

export function vaultStateKey(root: string): string {
  return `bessel:obsidian:${root}`;
}

export function loadVaultUiState(root: string): VaultUiState {
  try {
    const raw = localStorage.getItem(vaultStateKey(root));
    if (raw) {
      const saved = JSON.parse(raw) as Partial<VaultUiState> & {
        mode?: string;
      };
      return {
        ...DEFAULT_VAULT_UI_STATE,
        ...saved,
        // Migrate both former editor modes to the single live-preview editor.
        mode: saved.mode === "reading" ? "reading" : "edit",
      };
    }
  } catch {}
  return DEFAULT_VAULT_UI_STATE;
}

export function saveVaultUiState(root: string, state: VaultUiState): void {
  try {
    localStorage.setItem(vaultStateKey(root), JSON.stringify(state));
  } catch {}
}

export function useVaultUiState(root: string) {
  const [state, setState] = useState<VaultUiState>(() =>
    loadVaultUiState(root),
  );

  useEffect(() => {
    setState(loadVaultUiState(root));
  }, [root]);

  useEffect(() => {
    saveVaultUiState(root, state);
  }, [root, state]);

  const update = useCallback(
    (
      patch:
        | Partial<VaultUiState>
        | ((prev: VaultUiState) => Partial<VaultUiState>),
    ) => {
      setState((prev) => ({
        ...prev,
        ...(typeof patch === "function" ? patch(prev) : patch),
      }));
    },
    [],
  );

  return [state, update] as const;
}

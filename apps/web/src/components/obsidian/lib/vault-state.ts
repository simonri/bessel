import { useCallback, useEffect, useState } from "react";

export type NoteMode = "source" | "live" | "reading";

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
  mode: "live",
  expandedDirs: [],
  sidePanel: null,
};

export function vaultStateKey(root: string): string {
  return `bessel:obsidian:${root}`;
}

export function loadVaultUiState(root: string): VaultUiState {
  try {
    const raw = localStorage.getItem(vaultStateKey(root));
    if (raw)
      return {
        ...DEFAULT_VAULT_UI_STATE,
        ...(JSON.parse(raw) as Partial<VaultUiState>),
      };
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

import { createContext, useContext } from "react";
import type { IntegrationsTab } from "@/components/settings-integrations-page";
import type { SettingsPage } from "@/components/settings-modal";

// Apart from settings-dialog.tsx, so opening Settings from anywhere doesn't
// pull the whole Settings modal (and every page it shows) into that module.
export interface SettingsDialog {
  /** Opens Settings at `page`; on Integrations, `tab` picks "connected" or "add". */
  open: (page?: SettingsPage, tab?: IntegrationsTab) => void;
  close: () => void;
}

export const SettingsDialogContext = createContext<SettingsDialog>({
  open: () => {},
  close: () => {},
});

/** Opens Settings, at a given page when there is one. */
export function useOpenSettings(): SettingsDialog["open"] {
  return useContext(SettingsDialogContext).open;
}

/** Closes Settings, e.g. before sending the user to a page to finish something there. */
export function useCloseSettings(): SettingsDialog["close"] {
  return useContext(SettingsDialogContext).close;
}

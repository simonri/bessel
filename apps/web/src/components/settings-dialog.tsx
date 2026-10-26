import { createContext, type ReactNode, useContext, useState } from "react";
import type { IntegrationsTab } from "@/components/settings-integrations-page";
import { SettingsModal, type SettingsPage } from "@/components/settings-modal";

interface SettingsDialog {
  /** Opens Settings at `page`; on Integrations, `tab` picks "connected" or "add". */
  open: (page?: SettingsPage, tab?: IntegrationsTab) => void;
  close: () => void;
}

const SettingsDialogContext = createContext<SettingsDialog>({
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

/** Hosts the one Settings dialog, so any page can open it at the right place. */
export function SettingsDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [page, setPage] = useState<SettingsPage>("appearance");
  const [tab, setTab] = useState<IntegrationsTab>("connected");

  const dialog: SettingsDialog = {
    open: (at, atTab) => {
      if (at) setPage(at);
      setTab(atTab ?? "connected");
      setOpen(true);
    },
    close: () => setOpen(false),
  };

  return (
    <SettingsDialogContext.Provider value={dialog}>
      {children}
      <SettingsModal
        open={isOpen}
        page={page}
        integrationsTab={tab}
        onIntegrationsTabChange={setTab}
        onPageChange={setPage}
        onClose={() => setOpen(false)}
      />
    </SettingsDialogContext.Provider>
  );
}

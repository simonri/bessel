import { type ReactNode, useState } from "react";
import {
  type SettingsDialog,
  SettingsDialogContext,
} from "@/components/settings-dialog-context";
import type { IntegrationsTab } from "@/components/settings-integrations-page";
import { SettingsModal, type SettingsPage } from "@/components/settings-modal";

export {
  useCloseSettings,
  useOpenSettings,
} from "@/components/settings-dialog-context";

/** Hosts the one Settings dialog, so any page can open it at the right place. */
export function SettingsDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [page, setPage] = useState<SettingsPage>("dashboard");
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

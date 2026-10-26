import { Plug } from "lucide-react";
import { useOpenSettings } from "@/components/settings-dialog";
import type { SettingsPage } from "@/components/settings-modal";
import { SoftButton } from "@/components/ui-kit";

/** For a page with nothing to show yet: opens Settings where its data source is connected. */
export function ConnectInSettings({
  label = "Open integrations",
  page = "integrations",
}: {
  label?: string;
  page?: SettingsPage;
}) {
  const openSettings = useOpenSettings();
  return (
    <SoftButton
      size="default"
      className="mt-2"
      onClick={() => openSettings(page)}
    >
      <Plug />
      {label}
    </SoftButton>
  );
}

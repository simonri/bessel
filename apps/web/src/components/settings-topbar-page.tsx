import { useState } from "react";
import { SettingsRow, SettingsSection } from "@/components/settings-ui";
import { TextInput } from "@/components/ui-kit";
import { useSettings } from "@/hooks/use-settings";

export function TopBarPage() {
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState(settings.cryptoPairs);

  const save = () => update({ cryptoPairs: draft.trim() });

  return (
    <SettingsSection title="Top bar">
      <SettingsRow
        label="Crypto pairs"
        description="Shown in the top bar, separated by commas"
        htmlFor="crypto-pairs"
      >
        <TextInput
          id="crypto-pairs"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="BTCUSDT,ETHUSDT"
          className="w-64"
        />
      </SettingsRow>
    </SettingsSection>
  );
}

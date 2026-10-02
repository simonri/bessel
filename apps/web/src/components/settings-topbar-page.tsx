import { useState } from "react";
import { Panel, SectionLabel, TextInput } from "@/components/ui-kit";
import { useSettings } from "@/hooks/use-settings";

export function TopBarPage() {
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState(settings.cryptoPairs);

  const save = () => update({ cryptoPairs: draft.trim() });

  return (
    <div>
      <SectionLabel>Crypto ticker</SectionLabel>
      <Panel className="p-4">
        <div className="space-y-1.5">
          <label htmlFor="crypto-pairs" className="block text-13 text-white/80">
            Pairs
          </label>
          <p className="text-11 text-white/45">
            Comma-separated symbols shown in the top bar, e.g. BTCUSDT,ETHUSDT
          </p>
          <TextInput
            id="crypto-pairs"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="BTCUSDT,ETHUSDT"
            className="mt-1"
          />
        </div>
      </Panel>
    </div>
  );
}

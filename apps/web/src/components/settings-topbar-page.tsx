import { useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";
import { SettingsCard } from "@/components/settings-ui";
import { useSettings } from "@/hooks/use-settings";

export function TopBarPage() {
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState(settings.cryptoPairs);

  const save = () => update({ cryptoPairs: draft.trim() });

  return (
    <div>
      <SectionLabel>Crypto ticker</SectionLabel>
      <SettingsCard className="p-4">
        <div className="space-y-1.5">
          <label
            htmlFor="crypto-pairs"
            className="block text-13 font-medium text-white/75"
          >
            Pairs
          </label>
          <p className="text-11 text-white/45">
            Comma-separated symbols shown in the top bar, e.g. BTCUSDT,ETHUSDT
          </p>
          <input
            id="crypto-pairs"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="BTCUSDT,ETHUSDT"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors duration-150 focus:border-primary-500/40 focus:bg-white/[0.07]"
          />
        </div>
      </SettingsCard>
    </div>
  );
}

import { useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";
import { useSettings } from "@/hooks/use-settings";

export function TopBarPage() {
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState(settings.cryptoPairs);

  const save = () => update({ cryptoPairs: draft.trim() });

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Crypto ticker</SectionLabel>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="block text-13 font-medium text-white/75">
              Pairs
            </label>
            <p className="text-11 text-white/50">
              Comma-separated symbols shown in the top bar, e.g. BTCUSDT,ETHUSDT
            </p>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="BTCUSDT,ETHUSDT"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors focus:border-primary-500/40 focus:bg-white/[0.07]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

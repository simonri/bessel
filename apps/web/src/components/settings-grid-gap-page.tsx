import { SectionLabel } from "@/components/settings-section-label";
import { useSettings } from "@/hooks/use-settings";

export function GridGapPage() {
  const { settings, update } = useSettings();

  return (
    <div>
      <SectionLabel>Grid gap</SectionLabel>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={16}
            step={1}
            value={settings.gridGap}
            onChange={(e) => update({ gridGap: Number(e.target.value) })}
            className="h-1.5 flex-1 cursor-pointer accent-primary-500"
          />
          <span className="w-9 shrink-0 text-right font-mono text-13 text-white/70">
            {settings.gridGap}px
          </span>
        </div>
      </div>
    </div>
  );
}

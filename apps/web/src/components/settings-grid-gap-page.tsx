import { SettingsRow, SettingsSection } from "@/components/settings-ui";
import { useSettings } from "@/hooks/use-settings";

export function GridGapPage() {
  const { settings, update } = useSettings();

  return (
    <SettingsSection title="Canvas">
      <SettingsRow
        label="Grid gap"
        description="Space between widgets"
        htmlFor="grid-gap"
      >
        <input
          id="grid-gap"
          type="range"
          min={0}
          max={16}
          step={1}
          value={settings.gridGap}
          onChange={(e) => update({ gridGap: Number(e.target.value) })}
          className="h-1.5 w-52 cursor-pointer accent-primary-500"
        />
        <span className="w-9 text-right font-mono text-13 text-white/70">
          {settings.gridGap}px
        </span>
      </SettingsRow>
    </SettingsSection>
  );
}

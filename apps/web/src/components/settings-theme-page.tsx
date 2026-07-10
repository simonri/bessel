import { SectionLabel } from "@/components/settings-section-label";
import { type ThemeKey, useSettings } from "@/hooks/use-settings";

const THEME_OPTIONS: { key: ThemeKey; label: string; hue: number }[] = [
  { key: "orange", label: "Orange", hue: 40 },
  { key: "green", label: "Green", hue: 145 },
];

export function ThemePage() {
  const { settings, update } = useSettings();
  const selected = settings.theme;

  return (
    <div>
      <SectionLabel>Accent color</SectionLabel>
      <div className="flex gap-2">
        {THEME_OPTIONS.map(({ key, label, hue }) => {
          const isSelected = selected === key;
          return (
            <button
              key={key}
              onClick={() => update({ theme: key })}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-all ${
                isSelected
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/[0.07] text-white/40 hover:border-white/15 hover:text-white/70"
              }`}
            >
              <span
                className="size-3 rounded-full"
                style={{ background: `oklch(0.70 0.18 ${hue})` }}
              />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

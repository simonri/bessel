import { SectionLabel } from "@/components/settings-section-label";
import { type ThemeKey, useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

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
              type="button"
              onClick={() => update({ theme: key })}
              className={cn(
                "flex h-8 items-center gap-2 rounded-lg border px-3 text-13 font-medium transition-colors duration-150",
                isSelected
                  ? "border-primary-500/60 bg-primary-500/10 text-white/90"
                  : "border-white/10 text-white/55 hover:border-white/20 hover:text-white/80",
              )}
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

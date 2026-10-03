import { SectionLabel } from "@/components/ui-kit";
import { type ThemeKey, useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

// Mirrors the [data-theme] blocks in packages/ui/src/styles/globals.css:
// `chroma` scales the shared lightness ladder's saturation.
export const THEME_OPTIONS: {
  key: ThemeKey;
  label: string;
  hue: number;
  chroma: number;
}[] = [
  { key: "orange", label: "Peach", hue: 45, chroma: 0.92 },
  { key: "rose", label: "Rose", hue: 0, chroma: 0.85 },
  { key: "lilac", label: "Lilac", hue: 305, chroma: 0.75 },
  { key: "sky", label: "Sky", hue: 235, chroma: 0.75 },
  { key: "green", label: "Sage", hue: 150, chroma: 0.6 },
];

/** The theme's primary-500 in dark mode, as the swatch fill. */
export function swatchColor(hue: number, chroma: number): string {
  return `oklch(0.7 ${(0.18 * chroma).toFixed(3)} ${hue})`;
}

export function ThemePage() {
  const { settings, update } = useSettings();
  const selected = settings.theme;

  return (
    <div>
      <SectionLabel>Accent color</SectionLabel>
      <div role="radiogroup" aria-label="Accent color" className="flex gap-4">
        {THEME_OPTIONS.map(({ key, label, hue, chroma }) => {
          const isSelected = selected === key;
          const color = swatchColor(hue, chroma);
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => update({ theme: key })}
              className="group flex w-12 flex-col items-center gap-1.5 outline-none"
            >
              <span
                className={cn(
                  "size-8 rounded-full ring-2 ring-offset-2 ring-offset-panel transition-[box-shadow,transform] duration-150 ease-out group-hover:scale-105 group-active:scale-95",
                  isSelected
                    ? "ring-(--swatch)"
                    : "ring-transparent group-focus-visible:ring-white/40",
                )}
                style={
                  {
                    background: color,
                    "--swatch": color,
                  } as React.CSSProperties
                }
              />
              <span
                className={cn(
                  "text-11 font-medium transition-colors duration-150",
                  isSelected
                    ? "text-white/90"
                    : "text-white/50 group-hover:text-white/75",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

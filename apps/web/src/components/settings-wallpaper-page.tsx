import { SectionLabel } from "@/components/settings-section-label";
import {
  useSettings,
  WALLPAPER_COLORS,
  type WallpaperColorKey,
  type WallpaperKey,
} from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

const WALLPAPER_OPTIONS: {
  key: WallpaperKey;
  label: string;
  src: string;
  isVideo: boolean;
}[] = [
  { key: "image", label: "Static", src: "/image.png", isVideo: false },
  {
    key: "video",
    label: "Forest Night",
    src: "/wallpaper-forest-loop.mp4",
    isVideo: true,
  },
];

const COLOR_OPTIONS: { key: WallpaperColorKey; label: string }[] = [
  { key: "zinc", label: "Zinc" },
  { key: "neutral", label: "Neutral" },
  { key: "stone", label: "Stone" },
  { key: "umber", label: "Umber" },
];

export function WallpaperPage() {
  const { settings, update } = useSettings();
  const selected = settings.wallpaper;

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Background</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {WALLPAPER_OPTIONS.map(({ key, label, src, isVideo }) => (
            <button
              key={key}
              type="button"
              onClick={() => update({ wallpaper: key })}
              className={cn(
                "relative overflow-hidden rounded-lg border transition-colors duration-150",
                selected === key
                  ? "border-primary-500 ring-1 ring-primary-500"
                  : "border-white/10 hover:border-white/25",
              )}
              style={{ aspectRatio: "16/9" }}
            >
              {isVideo ? (
                <video
                  src={src}
                  muted
                  autoPlay
                  loop
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={src}
                  alt={label}
                  className="h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
                <span className="text-11 font-medium text-white/80">
                  {label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Solid color</SectionLabel>
        <div className="grid grid-cols-4 gap-3">
          {COLOR_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => update({ wallpaper: key })}
              className={cn(
                "relative overflow-hidden rounded-lg border transition-colors duration-150",
                selected === key
                  ? "border-primary-500 ring-1 ring-primary-500"
                  : "border-white/10 hover:border-white/25",
              )}
              style={{
                aspectRatio: "16/9",
                backgroundColor: WALLPAPER_COLORS[key],
              }}
            >
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                <span className="text-11 font-medium text-white/80">
                  {label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

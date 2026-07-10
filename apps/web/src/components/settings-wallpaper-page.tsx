import { SectionLabel } from "@/components/settings-section-label";
import { useSettings, type WallpaperKey } from "@/hooks/use-settings";

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
              onClick={() => update({ wallpaper: key })}
              className={`relative overflow-hidden rounded-xl border-2 transition-[border-color,box-shadow] ${
                selected === key
                  ? "border-primary-500 shadow-lg shadow-primary-900/30"
                  : "border-white/10 hover:border-white/25"
              }`}
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
              {selected === key && (
                <div className="absolute inset-0 bg-primary-500/10 ring-inset" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

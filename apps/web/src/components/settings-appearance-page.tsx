import { ThemePage } from "@/components/settings-theme-page";
import { WallpaperPage } from "@/components/settings-wallpaper-page";

export function AppearancePage() {
  return (
    <div className="space-y-8">
      <ThemePage />
      <WallpaperPage />
    </div>
  );
}

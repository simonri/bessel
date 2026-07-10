import { ActivityPage } from "@/components/settings-activity-page";
import { GridGapPage } from "@/components/settings-grid-gap-page";
import { TopBarPage } from "@/components/settings-topbar-page";

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <TopBarPage />
      <GridGapPage />
      <ActivityPage />
    </div>
  );
}

import {
  OPTIONAL_PAGES,
  type OptionalPage,
  PAGE_REGISTRY,
} from "@/components/pages";
import { SettingsSection, SettingsToggleRow } from "@/components/settings-ui";
import { usePageVisibility } from "@/components/use-page-visibility";
import { useSettings } from "@/hooks/use-settings";

const NEEDS: Record<OptionalPage, string> = {
  hyperliquid: "Needs a Hyperliquid address.",
  investments: "Needs an Avanza or Montrose account.",
  sleep: "Comes from the Bessel iPhone app, which isn't public yet.",
  activity: "Recorded by the Bessel desktop app.",
};

export function PagesPage() {
  const { settings, update } = useSettings();
  const { isVisible } = usePageVisibility();

  return (
    <SettingsSection
      title="Optional pages"
      description="These show in the sidebar once they have something to show. Turn one on or off here."
    >
      {OPTIONAL_PAGES.map((page) => (
        <SettingsToggleRow
          key={page}
          label={PAGE_REGISTRY[page].title}
          description={NEEDS[page]}
          checked={isVisible(page)}
          onCheckedChange={(on) =>
            update({ pageChoices: { ...settings.pageChoices, [page]: on } })
          }
        />
      ))}
    </SettingsSection>
  );
}

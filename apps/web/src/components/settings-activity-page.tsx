import { Plus, X } from "lucide-react";
import { useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";
import {
  SettingsEmpty,
  SettingsIconButton,
  SettingsInput,
} from "@/components/settings-ui";
import { type ActivityMapping, useSettings } from "@/hooks/use-settings";

export function ActivityPage() {
  const { settings, update } = useSettings();
  const [mappings, setMappings] = useState<ActivityMapping[]>(
    settings.activityMappings,
  );

  const save = (next: ActivityMapping[]) => {
    setMappings(next);
    update({ activityMappings: next });
  };

  const add = () => save([...mappings, { from: "", to: "" }]);
  const remove = (i: number) => save(mappings.filter((_, idx) => idx !== i));
  const change = (i: number, field: keyof ActivityMapping, value: string) =>
    save(mappings.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));

  return (
    <div>
      <SectionLabel>App name mappings</SectionLabel>

      <div className="space-y-2">
        {mappings.length > 0 && (
          <div className="flex gap-2 px-1 pr-9">
            <span className="flex-1 text-11 text-white/40">Raw name</span>
            <span className="flex-1 text-11 text-white/40">Display label</span>
          </div>
        )}

        {mappings.map((m, i) => (
          <div key={i} className="flex min-w-0 items-center gap-2">
            <SettingsInput
              value={m.from}
              onChange={(e) => change(i, "from", e.target.value)}
              placeholder="com.google.Chrome"
              className="flex-1"
            />
            <SettingsInput
              value={m.to}
              onChange={(e) => change(i, "to", e.target.value)}
              placeholder="Chrome"
              className="flex-1"
            />
            <SettingsIconButton
              destructive
              onClick={() => remove(i)}
              title="Remove mapping"
            >
              <X />
            </SettingsIconButton>
          </div>
        ))}

        {mappings.length === 0 && (
          <SettingsEmpty>No mappings yet</SettingsEmpty>
        )}

        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 pt-1 text-12 font-medium text-primary-400/80 transition-colors duration-150 hover:text-primary-300"
        >
          <Plus className="size-3.5" />
          Add mapping
        </button>
      </div>
    </div>
  );
}

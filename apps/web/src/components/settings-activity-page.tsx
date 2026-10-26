import { ArrowRight, Plus, X } from "lucide-react";
import { useState } from "react";
import { SettingsRow, SettingsSection } from "@/components/settings-ui";
import { IconButton, SoftButton, TextInput } from "@/components/ui-kit";
import { type ActivityMapping, useSettings } from "@/hooks/use-settings";

// Rows carry an id for React only; settings store plain mappings.
interface MappingRow extends ActivityMapping {
  id: string;
}

const newRow = (mapping: ActivityMapping): MappingRow => ({
  ...mapping,
  id: crypto.randomUUID(),
});

export function ActivityPage() {
  const { settings, update } = useSettings();
  const [mappings, setMappings] = useState(() =>
    settings.activityMappings.map(newRow),
  );

  const save = (next: MappingRow[]) => {
    setMappings(next);
    update({ activityMappings: next.map(({ from, to }) => ({ from, to })) });
  };

  const add = () => save([...mappings, newRow({ from: "", to: "" })]);
  const remove = (id: string) => save(mappings.filter((m) => m.id !== id));
  const change = (id: string, field: keyof ActivityMapping, value: string) =>
    save(mappings.map((m) => (m.id === id ? { ...m, [field]: value } : m)));

  return (
    <SettingsSection title="Screen time">
      <SettingsRow
        label="App names"
        description={
          mappings.length
            ? "The name an app reports, and what Bessel shows instead"
            : "Show an app under a friendlier name"
        }
      >
        <SoftButton onClick={add}>
          <Plus />
          Add mapping
        </SoftButton>
      </SettingsRow>
      {mappings.map((m) => (
        <div key={m.id} className="flex min-h-14 items-center gap-2 py-3">
          <TextInput
            aria-label="Name the app reports"
            value={m.from}
            onChange={(e) => change(m.id, "from", e.target.value)}
            placeholder="com.google.Chrome"
            className="flex-1"
          />
          <ArrowRight className="size-3.5 shrink-0 text-white/30" aria-hidden />
          <TextInput
            aria-label="Name to show"
            value={m.to}
            onChange={(e) => change(m.id, "to", e.target.value)}
            placeholder="Chrome"
            className="flex-1"
          />
          <IconButton
            destructive
            onClick={() => remove(m.id)}
            title="Remove mapping"
          >
            <X />
          </IconButton>
        </div>
      ))}
    </SettingsSection>
  );
}

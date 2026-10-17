import { Plus, X } from "lucide-react";
import { useState } from "react";
import {
  EmptyState,
  IconButton,
  SectionLabel,
  TextInput,
} from "@/components/ui-kit";
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
    <div>
      <SectionLabel>App name mappings</SectionLabel>

      <div className="space-y-2">
        {mappings.length > 0 && (
          <div className="flex gap-2 px-1 pr-9">
            <span className="flex-1 text-11 text-white/40">Raw name</span>
            <span className="flex-1 text-11 text-white/40">Display label</span>
          </div>
        )}

        {mappings.map((m) => (
          <div key={m.id} className="flex min-w-0 items-center gap-2">
            <TextInput
              value={m.from}
              onChange={(e) => change(m.id, "from", e.target.value)}
              placeholder="com.google.Chrome"
              className="flex-1"
            />
            <TextInput
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

        {mappings.length === 0 && <EmptyState>No mappings yet</EmptyState>}

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

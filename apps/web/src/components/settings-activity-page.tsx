import { Plus, X } from "lucide-react";
import { useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";
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
    <div className="space-y-5">
      <div>
        <SectionLabel>App name mappings</SectionLabel>

        <div className="space-y-2">
          {mappings.length > 0 && (
            <div className="flex gap-2 pr-9">
              <span className="flex-1 text-11 text-white/50">Raw name</span>
              <span className="flex-1 text-11 text-white/50">
                Display label
              </span>
            </div>
          )}

          {mappings.map((m, i) => (
            <div key={i} className="flex min-w-0 items-center gap-2">
              <input
                type="text"
                value={m.from}
                onChange={(e) => change(i, "from", e.target.value)}
                placeholder="com.google.Chrome"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors focus:border-primary-500/40 focus:bg-white/[0.07]"
              />
              <input
                type="text"
                value={m.to}
                onChange={(e) => change(i, "to", e.target.value)}
                placeholder="Chrome"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors focus:border-primary-500/40 focus:bg-white/[0.07]"
              />
              <button
                onClick={() => remove(i)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/20 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}

          {mappings.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 py-8 text-center">
              <p className="text-xs text-white/50">No mappings yet</p>
            </div>
          )}

          <button
            onClick={add}
            className="flex items-center gap-1.5 pt-1 text-12 font-medium text-primary-500/70 transition-colors hover:text-primary-400"
          >
            <Plus className="size-3.5" />
            Add mapping
          </button>
        </div>
      </div>
    </div>
  );
}

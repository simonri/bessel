import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@metron/ui/components/dialog";
import { type ActivityMapping, useSettings } from "@/hooks/use-settings";

type SidebarPage = "topbar" | "activity";

const SIDEBAR_ITEMS: { key: SidebarPage; label: string }[] = [
  { key: "topbar", label: "Top bar" },
  { key: "activity", label: "Activity" },
];

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [page, setPage] = useState<SidebarPage>("topbar");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex h-[440px]">
          <nav className="flex w-44 shrink-0 flex-col border-r border-white/10 bg-white/[0.02] p-2 pt-4">
            <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-white/30">
              Settings
            </p>
            {SIDEBAR_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                className={`rounded px-2 py-1.5 text-left text-sm transition-colors ${
                  page === item.key
                    ? "bg-white/10 text-white/90"
                    : "text-white/50 hover:bg-white/5 hover:text-white/70"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto p-6">
            {page === "topbar" && <TopBarPage />}
            {page === "activity" && <ActivityPage />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TopBarPage() {
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState(settings.cryptoPairs);

  const save = () => update({ cryptoPairs: draft.trim() });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-white/80">Top bar</h2>
        <p className="mt-0.5 text-xs text-white/40">Configure what appears in the top bar.</p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-white/60">Crypto pairs</label>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="BTCUSDT,ETHUSDT"
          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 outline-none placeholder:text-white/25 transition-colors focus:border-white/20 focus:bg-white/[0.07]"
        />
        <p className="text-[11px] text-white/30">
          Comma-separated trading pairs, e.g. BTCUSDT,ETHUSDT
        </p>
      </div>
    </div>
  );
}

function ActivityPage() {
  const { settings, update } = useSettings();
  const [mappings, setMappings] = useState<ActivityMapping[]>(settings.activityMappings);

  const save = (next: ActivityMapping[]) => {
    setMappings(next);
    update({ activityMappings: next });
  };

  const add = () => save([...mappings, { from: "", to: "" }]);

  const remove = (i: number) => save(mappings.filter((_, idx) => idx !== i));

  const change = (i: number, field: keyof ActivityMapping, value: string) => {
    save(mappings.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-white/80">Activity</h2>
        <p className="mt-0.5 text-xs text-white/40">
          Map raw app names to readable labels in the activity widget.
        </p>
      </div>

      <div className="space-y-2">
        {mappings.length > 0 && (
          <div className="flex gap-2 pr-9">
            <span className="flex-1 text-[11px] text-white/30">From</span>
            <span className="flex-1 text-[11px] text-white/30">To</span>
          </div>
        )}

        {mappings.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={m.from}
              onChange={(e) => change(i, "from", e.target.value)}
              placeholder="com.google.Chrome"
              className="min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors focus:border-white/20 focus:bg-white/[0.07]"
            />
            <input
              type="text"
              value={m.to}
              onChange={(e) => change(i, "to", e.target.value)}
              placeholder="Chrome"
              className="min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors focus:border-white/20 focus:bg-white/[0.07]"
            />
            <button
              onClick={() => remove(i)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-white/25 transition-colors hover:text-red-400"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        <button
          onClick={add}
          className="flex items-center gap-1.5 pt-1 text-xs text-white/40 transition-colors hover:text-white/70"
        >
          <Plus className="size-3.5" />
          Add mapping
        </button>
      </div>
    </div>
  );
}

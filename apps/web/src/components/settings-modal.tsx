import { useState } from "react";
import { Plus, X, LayoutDashboard, Activity, Settings } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ActivityMapping, useSettings } from "@/hooks/use-settings";

type SidebarPage = "topbar" | "activity";

const NAV_ITEMS = [
  { key: "topbar" as const, label: "Top bar", icon: LayoutDashboard },
  { key: "activity" as const, label: "Activity", icon: Activity },
];

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [page, setPage] = useState<SidebarPage>("topbar");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex h-[480px] w-full max-w-[640px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 bg-black/70 shadow-2xl backdrop-blur-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">Settings</DialogPrimitive.Title>

          {/* Sidebar */}
          <aside className="flex w-48 shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-[15px]">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.06]">
                <Settings className="size-3 text-white/40" />
              </div>
              <span className="text-[13px] font-semibold tracking-tight text-white/50">
                Settings
              </span>
            </div>
            <nav className="flex-1 space-y-0.5 p-2 pt-2.5">
              {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
                const active = page === key;
                return (
                  <button
                    key={key}
                    onClick={() => setPage(key)}
                    className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                      active
                        ? "bg-white/10 text-white/90"
                        : "text-white/40 hover:bg-white/5 hover:text-white/70"
                    }`}
                  >
                    <Icon
                      className={`size-3.5 shrink-0 transition-colors ${
                        active ? "text-white/60" : "text-white/25 group-hover:text-white/45"
                      }`}
                    />
                    <span className="text-[13px] font-medium">{label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-end px-4 pt-3.5 pb-0">
              <DialogPrimitive.Close className="flex h-6 w-6 items-center justify-center rounded-md text-white/25 transition-colors hover:bg-white/5 hover:text-white/60">
                <X className="size-3.5" />
              </DialogPrimitive.Close>
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto px-6 pb-6 pt-3">
              {page === "topbar" && <TopBarPage />}
              {page === "activity" && <ActivityPage />}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function TopBarPage() {
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState(settings.cryptoPairs);

  const save = () => update({ cryptoPairs: draft.trim() });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-white/80">Top bar</h2>
        <p className="mt-0.5 text-xs text-white/40">Configure what appears in the top bar.</p>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-white/50">Crypto pairs</label>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="BTCUSDT,ETHUSDT"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors focus:border-white/20 focus:bg-white/[0.07]"
          />
          <p className="text-[11px] text-white/30">
            Comma-separated trading pairs, e.g. BTCUSDT,ETHUSDT
          </p>
        </div>
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
  const change = (i: number, field: keyof ActivityMapping, value: string) =>
    save(mappings.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-white/80">Activity</h2>
        <p className="mt-0.5 text-xs text-white/40">
          Map raw app names to readable labels in the activity widget.
        </p>
      </div>

      <div className="space-y-2">
        {mappings.length > 0 && (
          <div className="flex gap-2 pr-9">
            <span className="flex-1 text-[11px] text-white/35">Raw name</span>
            <span className="flex-1 text-[11px] text-white/35">Display label</span>
          </div>
        )}

        {mappings.map((m, i) => (
          <div key={i} className="flex min-w-0 items-center gap-2">
            <input
              type="text"
              value={m.from}
              onChange={(e) => change(i, "from", e.target.value)}
              placeholder="com.google.Chrome"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors focus:border-white/20 focus:bg-white/[0.07]"
            />
            <input
              type="text"
              value={m.to}
              onChange={(e) => change(i, "to", e.target.value)}
              placeholder="Chrome"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors focus:border-white/20 focus:bg-white/[0.07]"
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
            <p className="text-xs text-white/25">No mappings yet</p>
          </div>
        )}

        <button
          onClick={add}
          className="flex items-center gap-1.5 pt-1 text-[12px] text-white/35 transition-colors hover:text-white/65"
        >
          <Plus className="size-3.5" />
          Add mapping
        </button>
      </div>
    </div>
  );
}

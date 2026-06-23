import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@metron/ui/components/dialog";
import { useSettings } from "@/hooks/use-settings";

type SidebarPage = "topbar";

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
            <button
              onClick={() => setPage("topbar")}
              className={`rounded px-2 py-1.5 text-left text-sm transition-colors ${
                page === "topbar"
                  ? "bg-white/10 text-white/90"
                  : "text-white/50 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              Top bar
            </button>
          </nav>

          <div className="flex-1 overflow-y-auto p-6">
            {page === "topbar" && <TopBarPage />}
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

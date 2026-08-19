import {
  GlassDialog,
  GlassDialogClose,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogTitle,
} from "@bessel/ui/components/glass-dialog";
import { RefreshCw, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

interface PortEntry {
  port: number;
  address: string;
  pid: number;
  processName: string;
  cmdline: string;
  cwd: string | null;
  ageSeconds: number | null;
}

function formatAge(ageSeconds: number | null): string {
  if (ageSeconds == null) return "";
  if (ageSeconds < 60) return `${ageSeconds}s`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m`;
  if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)}h`;
  return `${Math.floor(ageSeconds / 86400)}d`;
}

export function PortsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [supported, setSupported] = useState(true);
  const [entries, setEntries] = useState<PortEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [killTarget, setKillTarget] = useState<PortEntry | null>(null);
  const [killing, setKilling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await window.electron!.ports.list();
      setSupported(result.supported);
      setEntries(result.entries);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const confirmKill = async () => {
    if (!killTarget) return;
    setKilling(true);
    try {
      await window.electron!.ports.kill(killTarget.pid);
      setKillTarget(null);
      // The killed process's own dev-server wrapper (nodemon, `vp dev`, ...)
      // sometimes respawns immediately on the same port — refetch right away
      // so the list reflects what's actually listening now, not a stale
      // "still there" read that would look like the kill silently failed.
      await load();
    } finally {
      setKilling(false);
    }
  };

  return (
    <>
      <GlassDialog open={open} onOpenChange={(o) => !o && onClose()}>
        <GlassDialogContent
          showCloseButton={false}
          className="flex h-[70vh] w-full max-w-2xl flex-col p-0"
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
            <div>
              <GlassDialogTitle>Ports</GlassDialogTitle>
              <GlassDialogDescription className="mt-0.5">
                Listening dev servers and background processes on this machine.
              </GlassDialogDescription>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={load}
                disabled={loading}
                title="Refresh"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-white/75 disabled:opacity-40"
              >
                <RefreshCw
                  className={`size-3.5 ${loading ? "animate-spin" : ""}`}
                />
              </button>
              <GlassDialogClose className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors pointer-fine:hover:bg-white/5 pointer-fine:hover:text-white/60">
                <X className="size-3.5" />
              </GlassDialogClose>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {!supported ? (
              <p className="text-13 text-white/50">
                Port listing isn't supported on this OS yet.
              </p>
            ) : entries.length === 0 ? (
              <p className="text-13 text-white/50">
                {loading ? "Loading…" : "No relevant listening ports found."}
              </p>
            ) : (
              <div className="space-y-1">
                {entries.map((entry) => (
                  <div
                    key={`${entry.port}-${entry.pid}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]"
                  >
                    <span className="w-14 shrink-0 font-mono text-13 text-white/85">
                      {entry.port}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-13 text-white/75">
                        <span className="font-mono">{entry.processName}</span>
                        <span className="text-11 text-white/35">
                          pid {entry.pid}
                        </span>
                        {entry.ageSeconds != null && (
                          <span className="text-11 text-white/35">
                            {formatAge(entry.ageSeconds)}
                          </span>
                        )}
                      </div>
                      <div
                        className="truncate font-mono text-11 text-white/40"
                        title={entry.cmdline}
                      >
                        {entry.cwd ?? entry.cmdline}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setKillTarget(entry)}
                      title="Kill process"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <XCircle className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassDialogContent>
      </GlassDialog>

      <ConfirmDeleteDialog
        open={killTarget != null}
        onOpenChange={(o) => !o && setKillTarget(null)}
        title={`Kill ${killTarget?.processName ?? ""}?`}
        description={`This sends SIGTERM to pid ${killTarget?.pid} (port ${killTarget?.port}). Unsaved work in that process will be lost.`}
        onConfirm={confirmKill}
        isPending={killing}
        pendingLabel="Killing..."
      />
    </>
  );
}

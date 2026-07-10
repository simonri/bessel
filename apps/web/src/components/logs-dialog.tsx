import { useEffect, useRef, useState } from "react";
import {
  GlassDialog,
  GlassDialogClose,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogTitle,
} from "@metron/ui/components/glass-dialog";
import { Copy, FolderOpen, RefreshCw, X } from "lucide-react";

export function LogsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setLogs(await window.electron!.logs.read());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  const copy = async () => {
    await navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <GlassDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <GlassDialogContent
        showCloseButton={false}
        className="flex h-[70vh] w-full max-w-3xl flex-col p-0"
      >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
            <div>
              <GlassDialogTitle>Logs</GlassDialogTitle>
              <GlassDialogDescription className="mt-0.5">
                Diagnostic log for this app, including the previous session.
              </GlassDialogDescription>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={load}
                disabled={loading}
                title="Refresh"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-white/75 disabled:opacity-40"
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={copy}
                disabled={!logs}
                title="Copy to clipboard"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-white/75 disabled:opacity-40"
              >
                <Copy className="size-3.5" />
              </button>
              <button
                onClick={() => window.electron!.logs.reveal()}
                title="Reveal log file"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-white/75"
              >
                <FolderOpen className="size-3.5" />
              </button>
              <GlassDialogClose className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors pointer-fine:hover:bg-white/5 pointer-fine:hover:text-white/60">
                <X className="size-3.5" />
              </GlassDialogClose>
            </div>
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {logs ? (
              <pre className="whitespace-pre-wrap break-all font-mono text-11 leading-relaxed text-white/60">{logs}</pre>
            ) : (
              <p className="text-13 text-white/50">{loading ? "Loading…" : "No logs yet."}</p>
            )}
          </div>
          {copied && (
            <div className="border-t border-white/[0.06] px-5 py-2 text-11 text-emerald-400">Copied to clipboard</div>
          )}
      </GlassDialogContent>
    </GlassDialog>
  );
}

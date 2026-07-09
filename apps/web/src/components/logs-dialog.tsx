import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
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
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex h-[70vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-2xl backdrop-blur-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
            <div>
              <DialogPrimitive.Title className="text-[15px] font-semibold text-white/90">Logs</DialogPrimitive.Title>
              <p className="mt-0.5 text-xs text-white/35">Diagnostic log for this app, including the previous session.</p>
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
              <DialogPrimitive.Close className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-white/5 hover:text-white/60">
                <X className="size-3.5" />
              </DialogPrimitive.Close>
            </div>
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {logs ? (
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-white/60">{logs}</pre>
            ) : (
              <p className="text-[13px] text-white/30">{loading ? "Loading…" : "No logs yet."}</p>
            )}
          </div>
          {copied && (
            <div className="border-t border-white/[0.06] px-5 py-2 text-[11px] text-emerald-400">Copied to clipboard</div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { Spinner } from "@bessel/ui/components/spinner";
import { Check, Copy, ExternalLink } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { encode } from "uqr";
import { cn } from "@/lib/utils";
import { claudeSessionsApi, useClaudeSession } from "./claude-sessions-store";

const RETRY_MS = 3_000;
const SLOW_MS = 20_000;
const COPIED_MS = 1_500;

function QrCode({ value }: { value: string }) {
  const path = useMemo(() => {
    const { data } = encode(value, { border: 2 });
    let d = "";
    data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { d, size: data.length };
  }, [value]);
  return (
    <svg
      viewBox={`0 0 ${path.size} ${path.size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for the session link"
      className="size-44 rounded-lg bg-white"
    >
      <path d={path.d} fill="#000" />
    </svg>
  );
}

function RemoteLink({ sessionKey }: { sessionKey: string }) {
  const session = useClaudeSession(sessionKey);
  const url = session?.remoteUrl ?? null;
  const [copied, setCopied] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (url) return;
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, [url]);

  // The link appears once Remote Control has connected, which can take a few
  // seconds after a session starts — keep asking while the popover is open.
  useEffect(() => {
    if (url) return;
    let cancelled = false;
    const ask = () =>
      claudeSessionsApi()
        .remoteUrl(sessionKey)
        .catch(() => null)
        .then((found) => {
          if (!cancelled && !found) timer = setTimeout(ask, RETRY_MS);
        });
    let timer = setTimeout(ask, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionKey, url]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  if (!url) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-3 px-6 text-center">
        <Spinner className="size-5 text-white/50" />
        <p className="text-xs text-white/50">
          Waiting for Remote Control to connect…
        </p>
        {slow && (
          <p className="text-11 leading-relaxed text-white/40">
            This is taking a while. Remote Control needs Claude Code signed in
            with a claude.ai Pro or Max account on this machine.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <QrCode value={url} />
      <p className="text-center text-11 leading-relaxed text-white/50">
        Scan with your phone, or continue at claude.ai/code. The session keeps
        running here.
      </p>
      <div className="flex w-full gap-2">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(url).then(
              () => setCopied(true),
              () => toast.error("Couldn't copy the link"),
            );
          }}
          className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 text-xs font-medium text-white/75 transition-colors hover:border-white/20 hover:text-white/95"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={() => void window.electron?.shell.openExternal(url)}
          className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 text-xs font-medium text-white/75 transition-colors hover:border-white/20 hover:text-white/95"
        >
          <ExternalLink className="size-3.5" />
          Open
        </button>
      </div>
    </div>
  );
}

/** "Open on phone": the session's Remote Control link as a QR code. */
export function RemoteLinkPopover({
  sessionKey,
  children,
  side = "right",
  align = "start",
}: {
  sessionKey: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "bg-popover",
          "w-60 overflow-hidden rounded-xl border-white/10 p-0 shadow-2xl",
        )}
      >
        <RemoteLink sessionKey={sessionKey} />
      </PopoverContent>
    </Popover>
  );
}

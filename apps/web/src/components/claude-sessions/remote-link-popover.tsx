import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { Spinner } from "@bessel/ui/components/spinner";
import { Check, Copy, ExternalLink, Smartphone } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { useOpenSettings } from "@/components/settings-dialog";
import { cn } from "@/lib/utils";
import { claudeSessionsApi, useClaudeSession } from "./claude-sessions-store";

const RETRY_MS = 3_000;
const SLOW_MS = 20_000;
const COPIED_MS = 1_500;

function RemoteLink({ sessionKey }: { sessionKey: string }) {
  const session = useClaudeSession(sessionKey);
  const url = session?.remoteUrl ?? null;
  const [copied, setCopied] = useState(false);
  const [slow, setSlow] = useState(false);
  const openSettings = useOpenSettings();

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
      <div className="flex h-36 flex-col items-center justify-center gap-3 px-6 text-center">
        <Spinner className="size-5 text-white/50" />
        <p className="text-12 text-white/50">
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
    <div className="flex flex-col gap-3 p-4">
      <p className="text-12 leading-relaxed text-white/60">
        Open it in the Claude app or at claude.ai/code. It keeps running here.
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
          className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 text-12 font-medium text-white/75 transition-colors hover:border-white/20 hover:text-white/95"
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
          className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 text-12 font-medium text-white/75 transition-colors hover:border-white/20 hover:text-white/95"
        >
          <ExternalLink className="size-3.5" />
          Open
        </button>
      </div>
      <button
        type="button"
        onClick={() => openSettings("claude")}
        className="flex items-start gap-2 border-t border-white/[0.07] pt-3 text-left text-11 leading-relaxed text-white/45 transition-colors hover:text-white/80"
      >
        <Smartphone className="mt-0.5 size-3.5 shrink-0" />
        Start new sessions from your phone, and get notified when one needs you
      </button>
    </div>
  );
}

/** "Open on phone": the session's Remote Control link, to copy or open. */
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

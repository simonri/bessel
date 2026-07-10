import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Gamepad2,
  Home,
  Lock,
  Mail,
  MessageCircle,
  Play,
  RotateCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useWindowTitle } from "@/components/canvas/window-manager";
import type {
  DidFailLoadEvent,
  DidNavigateEvent,
  PageTitleUpdatedEvent,
  RenderProcessGoneEvent,
  WebviewTag,
} from "@/types/webview";

const BROWSER_PARTITION = "persist:browser";

// A guest renderer crash (native GPU/video-decode faults are the common
// culprit for video-heavy sites) is usually transient — reload the same URL
// a few times with backoff before giving up and showing the manual retry UI,
// so a one-off crash doesn't strand the tab on a dead frame.
const MAX_CRASH_AUTO_RETRIES = 3;
const CRASH_RETRY_BASE_DELAY_MS = 1000;

const QUICK_LAUNCH = [
  {
    label: "YouTube",
    url: "https://www.youtube.com",
    icon: Play,
    className: "bg-red-500/20 text-red-400",
  },
  {
    label: "Twitch",
    url: "https://www.twitch.tv",
    icon: Gamepad2,
    className: "bg-purple-500/20 text-purple-400",
  },
  {
    label: "Google",
    url: "https://www.google.com",
    icon: Search,
    className: "bg-blue-500/20 text-blue-400",
  },
  {
    label: "Gmail",
    url: "https://mail.google.com",
    icon: Mail,
    className: "bg-orange-500/20 text-orange-400",
  },
  {
    label: "Reddit",
    url: "https://www.reddit.com",
    icon: MessageCircle,
    className: "bg-orange-600/20 text-orange-500",
  },
];

// A bare "youtube.com"-style token is treated as a domain; anything else goes
// to search — this is the same heuristic every browser's address bar uses.
function resolveAddress(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[^\s]+\.[^\s]{2,}(\/.*)?$/.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface BrowserWidgetProps {
  initialUrl?: string;
  onUrlChange?: (url: string) => void;
}

export function BrowserWidget({ initialUrl, onUrlChange }: BrowserWidgetProps) {
  const webviewRef = useRef<WebviewTag | null>(null);
  const [address, setAddress] = useState(initialUrl ?? "");
  const [showHome, setShowHome] = useState(!initialUrl);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [failed, setFailed] = useState<{
    code: number;
    description: string;
  } | null>(null);

  const setWindowTitle = useWindowTitle();
  const setWindowTitleRef = useRef(setWindowTitle);
  useEffect(() => {
    setWindowTitleRef.current = setWindowTitle;
  });

  const onUrlChangeRef = useRef(onUrlChange);
  useEffect(() => {
    onUrlChangeRef.current = onUrlChange;
  });

  const navigate = useCallback((target: string) => {
    const resolved = resolveAddress(target);
    if (!resolved) return;
    setFailed(null);
    setShowHome(false);
    setAddress(resolved);
    webviewRef.current?.loadURL(resolved);
  }, []);

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const crashRetry = { attempts: 0, timer: null as ReturnType<typeof setTimeout> | null };

    const onStartLoading = () => {
      setLoading(true);
      setFailed(null);
    };
    const onStopLoading = () => setLoading(false);

    const onNavigate = (e: Event) => {
      const url = (e as DidNavigateEvent).url;
      if (!url || url === "about:blank") return;
      setAddress(url);
      setCanGoBack(wv.canGoBack());
      setCanGoForward(wv.canGoForward());
      onUrlChangeRef.current?.(url);
      // A real navigation completed, so the guest is healthy again — don't
      // let attempts from an earlier, unrelated crash burst count against it.
      crashRetry.attempts = 0;
    };

    const onTitle = (e: Event) => {
      setWindowTitleRef.current?.((e as PageTitleUpdatedEvent).title || null);
    };

    const onFail = (e: Event) => {
      const evt = e as DidFailLoadEvent;
      // -3 is ERR_ABORTED: fired whenever a load is superseded by another
      // navigation (e.g. the user typed a new URL mid-load) — not a real failure.
      if (evt.errorCode === -3 || !evt.isMainFrame) return;
      setLoading(false);
      setFailed({ code: evt.errorCode, description: evt.errorDescription });
    };

    // Fired when the guest's underlying renderer process dies (crash, OOM-kill,
    // GPU-related abort during heavy video playback, ...). None of the other
    // handlers fire in this case, so without this the widget silently freezes
    // on its last painted frame with no way to recover short of closing it.
    // Most such crashes are transient, so reload a few times with backoff
    // before falling back to the manual retry UI.
    const onRenderProcessGone = (e: Event) => {
      const { reason, exitCode } = (e as RenderProcessGoneEvent).details;
      setLoading(false);

      if (crashRetry.attempts < MAX_CRASH_AUTO_RETRIES) {
        crashRetry.attempts += 1;
        const delay =
          CRASH_RETRY_BASE_DELAY_MS * 2 ** (crashRetry.attempts - 1);
        crashRetry.timer = setTimeout(() => wv.reload(), delay);
        return;
      }

      setFailed({
        code: exitCode,
        description: `The page stopped responding (${reason}).`,
      });
    };

    wv.addEventListener("did-start-loading", onStartLoading);
    wv.addEventListener("did-stop-loading", onStopLoading);
    wv.addEventListener("did-navigate", onNavigate);
    wv.addEventListener("did-navigate-in-page", onNavigate);
    wv.addEventListener("page-title-updated", onTitle);
    wv.addEventListener("did-fail-load", onFail);
    wv.addEventListener("render-process-gone", onRenderProcessGone);
    return () => {
      if (crashRetry.timer) clearTimeout(crashRetry.timer);
      wv.removeEventListener("did-start-loading", onStartLoading);
      wv.removeEventListener("did-stop-loading", onStopLoading);
      wv.removeEventListener("did-navigate", onNavigate);
      wv.removeEventListener("did-navigate-in-page", onNavigate);
      wv.removeEventListener("page-title-updated", onTitle);
      wv.removeEventListener("did-fail-load", onFail);
      wv.removeEventListener("render-process-gone", onRenderProcessGone);
    };
  }, []);

  const goHome = useCallback(() => {
    setShowHome(true);
    setFailed(null);
    setAddress("");
  }, []);

  const isSecure = /^https:\/\//i.test(address);

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 bg-white/[0.03] px-2 py-1.5">
        <button
          type="button"
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          className="flex size-6 items-center justify-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
          className="flex size-6 items-center justify-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <ArrowRight className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            loading ? webviewRef.current?.stop() : webviewRef.current?.reload()
          }
          className="flex size-6 items-center justify-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          {loading ? (
            <X className="size-3.5" />
          ) : (
            <RotateCw className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={goHome}
          className="flex size-6 items-center justify-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <Home className="size-3.5" />
        </button>

        <form
          className="mx-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(address);
          }}
        >
          {isSecure ? (
            <Lock className="size-3 shrink-0 text-white/30" />
          ) : (
            <Search className="size-3 shrink-0 text-white/30" />
          )}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Search or enter address"
            className="min-w-0 flex-1 bg-transparent text-xs text-white/80 placeholder:text-white/30 focus:outline-none"
            spellCheck={false}
          />
        </form>
      </div>

      <div className="relative min-h-0 flex-1">
        <webview
          ref={webviewRef as unknown as React.Ref<HTMLWebViewElement>}
          src={initialUrl || "about:blank"}
          partition={BROWSER_PARTITION}
          allowpopups
          className="absolute inset-0 h-full w-full"
        />

        {showHome && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-neutral-950 px-6">
            <div className="grid grid-cols-5 gap-3">
              {QUICK_LAUNCH.map(({ label, url, icon: Icon, className }) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => navigate(url)}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-2 transition hover:bg-white/5"
                >
                  <span
                    className={`flex size-9 items-center justify-center rounded-full ${className}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="text-11 text-white/50">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {failed && !showHome && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center">
            <ShieldAlert className="size-6 text-white/30" />
            <div>
              <div className="text-sm text-white/70">
                Couldn't load {hostOf(address)}
              </div>
              <div className="mt-0.5 text-xs text-white/50">
                {failed.description}
              </div>
            </div>
            <button
              type="button"
              onClick={() => webviewRef.current?.reload()}
              className="rounded-md border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:bg-white/10"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

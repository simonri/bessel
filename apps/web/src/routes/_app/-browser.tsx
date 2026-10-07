import { useCallback, useEffect, useRef } from "react";
import { BrowserWidget } from "@/components/browser-widget";
import {
  useWindowActions,
  useWindowEntry,
} from "@/components/canvas/window-manager";

// did-navigate-in-page fires often on SPA-heavy sites (YouTube's client router
// included) — debounce the localStorage write so scrubbing through a site
// doesn't hammer it, while the visible address bar still updates instantly.
const PERSIST_DELAY_MS = 800;

export function BrowserPage() {
  const entry = useWindowEntry();
  const { updateWindowData } = useWindowActions();
  const pendingRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    save: () => void;
  } | null>(null);

  // Unmounting (closing, or moving the window to another workspace) saves
  // the last URL rather than dropping it.
  useEffect(
    () => () => {
      const pending = pendingRef.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      pending.save();
    },
    [],
  );

  const handleUrlChange = useCallback(
    (url: string) => {
      if (!entry) return;
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
      const save = () => {
        pendingRef.current = null;
        updateWindowData(entry.id, { url });
      };
      pendingRef.current = {
        timer: setTimeout(save, PERSIST_DELAY_MS),
        save,
      };
    },
    [entry, updateWindowData],
  );

  return (
    <BrowserWidget
      initialUrl={entry?.data?.url}
      onUrlChange={handleUrlChange}
    />
  );
}

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleUrlChange = useCallback(
    (url: string) => {
      if (!entry) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => updateWindowData(entry.id, { url }),
        PERSIST_DELAY_MS,
      );
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

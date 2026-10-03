import { useEffect, useRef, useState } from "react";

// Long enough for the tick and sparkles to play, short enough not to wait.
const CELEBRATE_MS = 520;
const EXIT_MS = 200;

/**
 * Plays the completion moment before actually completing. Phases: "idle",
 * "checked" (tick + sparkles), "leaving" (row fades/slides out). If the row
 * unmounts mid-way (filter change, refetch) the completion is still sent —
 * a click is never lost.
 */
export function useDelayedComplete(onComplete: () => void) {
  const [phase, setPhase] = useState<"idle" | "checked" | "leaving">("idle");
  const timers = useRef<number[]>([]);
  const pending = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      if (pending.current) onCompleteRef.current();
    },
    [],
  );

  const complete = () => {
    if (phase !== "idle") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onComplete();
      return;
    }
    pending.current = true;
    setPhase("checked");
    timers.current.push(
      window.setTimeout(() => setPhase("leaving"), CELEBRATE_MS),
      window.setTimeout(() => {
        pending.current = false;
        onCompleteRef.current();
      }, CELEBRATE_MS + EXIT_MS),
    );
  };

  return { phase, complete };
}

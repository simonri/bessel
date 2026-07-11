import { useEffect, useState } from "react";

export type Platform = "mac" | "windows" | "linux";

function detectPlatform(): Platform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad|iPod/.test(ua)) return "mac";
  if (/Win/.test(ua)) return "windows";
  if (/Linux|X11/.test(ua)) return "linux";
  return null;
}

// Returns null during SSR and on first client render, then the detected
// platform once mounted — avoids a hydration mismatch between server and
// client markup.
export function usePlatform(): Platform | null {
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return platform;
}

import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The app defines custom pixel-precise text sizes (text-9..text-13, text-15 —
// see globals.css) via Tailwind's `@utility`. twMerge doesn't know about them,
// so without this it lumps bare "text-11" etc. in with the text-COLOR group
// (both start with "text-") and silently drops whichever one came first —
// e.g. cn("text-11 text-white/60") merges down to just "text-white/60",
// leaving the element with no font-size utility at all.
const twMergeCustom = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["9", "10", "11", "12", "13", "15"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMergeCustom(clsx(inputs));
}

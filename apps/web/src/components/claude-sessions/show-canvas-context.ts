import { createContext, useContext } from "react";

/** Brings the canvas page on screen — provided by AppShell. */
export const ShowCanvasContext = createContext<() => void>(() => {});

export function useShowCanvas(): () => void {
  return useContext(ShowCanvasContext);
}

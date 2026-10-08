import { createContext, useContext } from "react";
import type { PageKey } from "@/components/pages";

/** Switches the shell to another page — provided by AppShell. */
export const OpenPageContext = createContext<(page: PageKey) => void>(() => {});

export function useOpenPage(): (page: PageKey) => void {
  return useContext(OpenPageContext);
}

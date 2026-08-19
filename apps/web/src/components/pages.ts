import { LayoutGrid } from "lucide-react";

// Top-level pages the sidebar navigates between. Pages are shell state rather
// than router routes: the canvas must stay mounted for the app's whole life
// (terminal PTYs, agent sessions), so switching pages hides/shows rather than
// unmounts — the same trick the canvas uses for inactive workspaces.
export type PageKey = "canvas";

export interface PageConfig {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const PAGE_REGISTRY: Record<PageKey, PageConfig> = {
  canvas: { title: "Canvas", icon: LayoutGrid },
};

export const PAGE_ORDER: PageKey[] = ["canvas"];

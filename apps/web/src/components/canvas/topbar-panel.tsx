import { PopoverContent } from "@bessel/ui/components/popover";
import { ArrowUpRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// One look for every top bar popover, modelled on claude.ai's usage panel: a
// quiet header line with no rule under it, 13px rows, muted secondary text
// on the right.

const WIDTHS = { md: "w-80", lg: "w-96" } as const;

/** A row in a panel's list; the list sits in a `px-2` body. */
export const TOPBAR_PANEL_ROW =
  "group flex items-center gap-3 rounded-lg px-2 py-1.5 text-13 transition-colors duration-150 hover:bg-white/[0.04]";

/** Text buttons in a panel header or footer. */
export const TOPBAR_PANEL_ACTION =
  "shrink-0 rounded-md px-1.5 py-0.5 text-12 text-white/45 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/80";

/** Icon buttons that appear on a row's hover. */
export const TOPBAR_PANEL_ROW_ICON =
  "flex size-6 shrink-0 items-center justify-center rounded-md text-white/30 opacity-0 transition-[opacity,color,background-color] duration-150 group-hover:opacity-100 hover:bg-white/[0.06] hover:text-white/80 focus-visible:opacity-100 [&_svg]:size-3.5";

export function TopbarPanel({
  width = "md",
  className,
  style,
  children,
  ...props
}: ComponentProps<typeof PopoverContent> & { width?: keyof typeof WIDTHS }) {
  return (
    <PopoverContent
      align="end"
      sideOffset={8}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border-white/10 bg-popover p-0 shadow-2xl",
        WIDTHS[width],
        className,
      )}
      style={{ maxHeight: "min(32rem, 80vh)", ...style }}
      {...props}
    >
      {children}
    </PopoverContent>
  );
}

/** With `href` the whole line links out, like claude.ai's usage header. */
export function TopbarPanelHeader({
  title,
  href,
  action,
}: {
  title: ReactNode;
  href?: string;
  action?: ReactNode;
}) {
  const content = <span className="min-w-0 flex-1 truncate">{title}</span>;
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="group flex shrink-0 items-center gap-2 px-4 pt-3 pb-1 text-13 text-white/55 transition-colors duration-150 hover:text-white/80"
      >
        {content}
        <ArrowUpRight className="size-3.5 shrink-0 text-white/35 transition-colors duration-150 group-hover:text-white/70" />
      </a>
    );
  }
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 pt-1 pr-2.5 pl-4 text-13 text-white/55">
      {content}
      {action}
    </div>
  );
}

export function TopbarPanelBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-2 pb-2", className)}>
      {children}
    </div>
  );
}

export function TopbarPanelEmpty({ children }: { children: ReactNode }) {
  return <p className="px-2 pt-1 pb-2 text-13 text-white/40">{children}</p>;
}

export function TopbarPanelFooter({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 border-t border-white/[0.06] p-2">{children}</div>
  );
}

import { glassSurface } from "@bessel/ui/lib/glass";
import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared by canvas widgets and full pages so a module looks the same whether
// it's docked on the canvas or opened from the sidebar.
export const WINDOW_FRAME = cn(
  glassSurface({ weight: "medium" }),
  "relative flex h-full flex-col overflow-hidden rounded-xl border border-white/15 shadow-2xl",
);

export function WindowTitleBar({
  icon: Icon,
  title,
  subtitle,
  leading,
  children,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Rendered before the icon, e.g. a status dot. */
  leading?: ReactNode;
  /** Right-aligned actions. */
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-2 border-b border-white/5 bg-chrome pr-1.5 pl-3",
        className,
      )}
      {...props}
    >
      {leading}
      <Icon className="size-3.5 shrink-0 text-white/60" />
      <span className="min-w-0 select-none truncate text-xs font-semibold text-white/90">
        {title}
        {subtitle && (
          <span className="ml-1.5 font-normal text-white/50">/ {subtitle}</span>
        )}
      </span>
      {children && (
        <div className="ml-auto flex min-w-0 items-center gap-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

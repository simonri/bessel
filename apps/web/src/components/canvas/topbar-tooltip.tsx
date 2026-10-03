import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@bessel/ui/components/tooltip";
import type { ComponentProps, ReactNode } from "react";

const OPEN_DELAY_MS = 350;

/** Names an icon-only top-bar control. Wraps the control itself, so it can
 *  sit inside a Popover/DropdownMenu trigger (asChild all the way down). */
// Props are passed through to the trigger: as the child of a PopoverTrigger
// (asChild), this element receives the popover's click handler, ref and aria
// state, and must hand them on to the button.
export function TopbarTooltip({
  label,
  children,
  ...triggerProps
}: {
  label: string;
  children: ReactNode;
} & Omit<ComponentProps<typeof TooltipTrigger>, "asChild" | "children">) {
  return (
    <Tooltip delayDuration={OPEN_DELAY_MS}>
      <TooltipTrigger asChild {...triggerProps}>
        {children}
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        sideOffset={6}
        className="rounded-lg border border-white/10 bg-popover px-2.5 py-1 text-xs font-medium text-white/85 shadow-xl [&>span]:hidden"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

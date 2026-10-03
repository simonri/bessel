import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { Timer } from "lucide-react";
import { Counters } from "@/components/counters";
import { TOPBAR_ICON_BUTTON } from "./topbar-styles";
import { TopbarTooltip } from "./topbar-tooltip";

export function TimeSinceDropdown() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <TopbarTooltip label="Time since">
          <button
            type="button"
            aria-label="Time since"
            className={TOPBAR_ICON_BUTTON}
          >
            <Timer />
          </button>
        </TopbarTooltip>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="h-80 w-72 overflow-hidden rounded-xl border-white/10 bg-popover p-0 shadow-2xl"
      >
        <Counters />
      </PopoverContent>
    </Popover>
  );
}

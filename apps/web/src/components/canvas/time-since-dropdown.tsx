import { Popover, PopoverTrigger } from "@bessel/ui/components/popover";
import { Timer } from "lucide-react";
import { Counters } from "@/components/counters";
import { TopbarPanel } from "./topbar-panel";
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
      <TopbarPanel>
        <Counters />
      </TopbarPanel>
    </Popover>
  );
}

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { Timer } from "lucide-react";
import { Counters } from "@/components/counters";
import { TOPBAR_ICON_BUTTON } from "./topbar-styles";

export function TimeSinceDropdown() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title="Time since" className={TOPBAR_ICON_BUTTON}>
          <Timer />
        </button>
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

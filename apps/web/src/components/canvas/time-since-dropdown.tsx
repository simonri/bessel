import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metron/ui/components/popover";
import { Timer } from "lucide-react";
import { Counters } from "@/components/counters";

export function TimeSinceDropdown() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70">
          <Timer className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="h-80 w-72 overflow-hidden rounded-xl border-white/10 bg-black/60 p-0 shadow-2xl backdrop-blur-xl"
      >
        <Counters />
      </PopoverContent>
    </Popover>
  );
}

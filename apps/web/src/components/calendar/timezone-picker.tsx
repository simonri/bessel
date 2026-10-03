import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@bessel/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  shortOffsetLabel,
  systemTimeZone,
  type TimeZoneOption,
  timeZoneOptions,
} from "./calendar-timezone";

function matches(option: TimeZoneOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [option.city, option.name, option.offset, option.id].some((field) =>
    field.toLowerCase().includes(q),
  );
}

export function TimeZonePicker({
  timeZone,
  onChange,
}: {
  timeZone: string;
  onChange: (timeZone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(timeZone);
  // Offsets and names depend on DST, so compute them for "now" each time the
  // list opens rather than once at module load.
  const options = useMemo(
    () => (open ? timeZoneOptions(new Date()) : []),
    [open],
  );
  const visible = options.filter((o) => matches(o, query));
  const system = systemTimeZone();

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          setHighlighted(timeZone);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Change time zone"
          className={cn(
            "rounded px-1 py-0.5 text-10 text-white/35 outline-none transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/70 focus-visible:ring-1 focus-visible:ring-white/25",
            open && "bg-white/[0.1] text-white/80",
            timeZone !== system && "text-primary-300/80",
          )}
        >
          {shortOffsetLabel(timeZone, new Date())}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[400px] overflow-hidden rounded-xl border-white/10 p-0 shadow-2xl"
      >
        <Command
          shouldFilter={false}
          value={highlighted}
          onValueChange={setHighlighted}
          className="bg-transparent"
        >
          <CommandInput
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              const first = options.find((o) => matches(o, value));
              if (first) setHighlighted(first.id);
            }}
            placeholder={timeZone.split("/").at(-1)?.replaceAll("_", " ")}
            className="text-13"
          />
          <CommandList
            className="max-h-[320px] p-1"
            // Open scrolled to the current zone, like a native select.
            ref={(list) => {
              if (!list || query) return;
              list
                .querySelector(`[data-zone="${CSS.escape(timeZone)}"]`)
                ?.scrollIntoView({ block: "center" });
            }}
          >
            <CommandEmpty className="py-6 text-center text-12 text-white/40">
              No time zone found.
            </CommandEmpty>
            {timeZone !== system && !query && (
              <CommandItem
                value={`system:${system}`}
                onSelect={() => {
                  onChange(system);
                  setOpen(false);
                }}
                className="rounded-md text-13 text-white/75 data-[selected=true]:bg-white/[0.08]"
              >
                Use system time zone
                <span className="text-white/40">
                  {system.split("/").at(-1)?.replaceAll("_", " ")}
                </span>
              </CommandItem>
            )}
            {visible.map((option) => (
              <CommandItem
                key={option.id}
                value={option.id}
                data-zone={option.id}
                onSelect={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className={cn(
                  "gap-0 rounded-md text-13 data-[selected=true]:bg-white/[0.08]",
                  option.id === timeZone && "bg-white/[0.06]",
                )}
              >
                <span className="w-[4.75rem] shrink-0 tabular-nums text-white/40">
                  {option.offset}
                </span>
                <span className="min-w-0 flex-1 truncate text-white/80">
                  {option.name}
                  <span className="text-white/40"> – </span>
                  {option.city}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

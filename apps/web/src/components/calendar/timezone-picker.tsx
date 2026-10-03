import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { Search } from "lucide-react";
import {
  type KeyboardEvent,
  memo,
  useCallback,
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import {
  currentTimeZoneOptions,
  shortOffsetLabel,
  systemTimeZone,
  type TimeZoneOption,
} from "./calendar-timezone";

const SYSTEM_ROW = "system";

export function filterZones(
  options: TimeZoneOption[],
  query: string,
): TimeZoneOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  return options.filter((o) => words.every((w) => o.search.includes(w)));
}

const rowClass =
  "flex h-8 w-full items-center rounded-md px-2 text-left text-13 outline-none [content-visibility:auto] [contain-intrinsic-size:auto_2rem]";

// Rows only re-render when their own highlight or selection changes, so
// moving through ~420 zones stays smooth.
const ZoneRow = memo(function ZoneRow({
  option,
  index,
  active,
  current,
  onHover,
  onPick,
}: {
  option: TimeZoneOption;
  index: number;
  active: boolean;
  current: boolean;
  onHover: (index: number) => void;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      id={`zone-${index}`}
      aria-selected={current}
      data-zone={option.id}
      data-active={active || undefined}
      tabIndex={-1}
      onPointerMove={() => onHover(index)}
      onClick={() => onPick(option.id)}
      className={cn(rowClass, active && "bg-white/[0.08]")}
    >
      <span className="w-[4.75rem] shrink-0 tabular-nums text-white/40">
        {option.offset}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          current ? "text-white" : "text-white/80",
        )}
      >
        {option.name}
        <span className="text-white/40"> – </span>
        {option.city}
      </span>
      {current && (
        <span className="ml-2 size-1.5 shrink-0 rounded-full bg-primary-400" />
      )}
    </button>
  );
});

function ZoneList({
  timeZone,
  onPick,
}: {
  timeZone: string;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const options = currentTimeZoneOptions();
  const visible = useMemo(
    () => filterZones(options, deferredQuery),
    [options, deferredQuery],
  );
  const system = systemTimeZone();
  const showSystem = timeZone !== system && !deferredQuery;
  // Rows as the keyboard sees them: the optional system row, then the zones.
  const ids = useMemo(
    () => [...(showSystem ? [SYSTEM_ROW] : []), ...visible.map((o) => o.id)],
    [showSystem, visible],
  );
  const [active, setActive] = useState(() =>
    Math.max(0, ids.indexOf(timeZone)),
  );
  const listRef = useRef<HTMLDivElement>(null);

  // Once, on open: centre the current zone. Never again, so scrolling and
  // hovering are left alone.
  useLayoutEffect(() => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-zone]");
    [...(rows ?? [])]
      .find((row) => row.dataset.zone === timeZone)
      ?.scrollIntoView({ block: "center" });
  }, [timeZone]);

  const move = (to: number) => {
    const next = Math.min(Math.max(to, 0), ids.length - 1);
    setActive(next);
    listRef.current
      ?.querySelector(`#zone-${next}`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const pickId = (id: string) => onPick(id === SYSTEM_ROW ? system : id);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") move(active + 1);
    else if (e.key === "ArrowUp") move(active - 1);
    else if (e.key === "PageDown") move(active + 8);
    else if (e.key === "PageUp") move(active - 8);
    else if (e.key === "Enter" && ids[active]) pickId(ids[active]);
    else return;
    e.preventDefault();
  };

  const hover = useCallback((index: number) => setActive(index), []);
  const offset = showSystem ? 1 : 0;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3">
        <Search className="size-3.5 shrink-0 text-white/35" />
        <input
          // biome-ignore lint/a11y/noAutofocus: the picker opens to search
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls="zone-list"
          aria-activedescendant={`zone-${active}`}
          aria-label="Search time zones"
          placeholder="Search city, zone or offset"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            listRef.current?.scrollTo({ top: 0 });
          }}
          onKeyDown={onKeyDown}
          className="h-10 min-w-0 flex-1 bg-transparent text-13 text-white/85 outline-none placeholder:text-white/30"
        />
      </div>
      <div
        ref={listRef}
        id="zone-list"
        role="listbox"
        aria-label="Time zones"
        className="max-h-[320px] overflow-y-auto overscroll-contain p-1"
      >
        {showSystem && (
          <button
            type="button"
            role="option"
            id="zone-0"
            aria-selected={false}
            tabIndex={-1}
            onPointerMove={() => setActive(0)}
            onClick={() => onPick(system)}
            className={cn(
              rowClass,
              "gap-2 text-white/75",
              active === 0 && "bg-white/[0.08]",
            )}
          >
            Use system time zone
            <span className="text-white/40">
              {system.split("/").at(-1)?.replaceAll("_", " ")}
            </span>
          </button>
        )}
        {visible.map((option, i) => (
          <ZoneRow
            key={option.id}
            option={option}
            index={i + offset}
            active={active === i + offset}
            current={option.id === timeZone}
            onHover={hover}
            onPick={onPick}
          />
        ))}
        {visible.length === 0 && (
          <p className="py-6 text-center text-12 text-white/40">
            No time zone found.
          </p>
        )}
      </div>
    </div>
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
  const system = systemTimeZone();
  const pick = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Change time zone"
          // Build the zone list while the pointer heads for the button.
          onPointerEnter={() => currentTimeZoneOptions()}
          onFocus={() => currentTimeZoneOptions()}
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
        {/* Mounted per open: starts at the current zone with an empty search. */}
        {open && <ZoneList timeZone={timeZone} onPick={pick} />}
      </PopoverContent>
    </Popover>
  );
}

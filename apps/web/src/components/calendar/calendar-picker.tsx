import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import type { CalendarAccount, CalendarInfo } from "./calendar-types";

export interface CalendarGroup {
  account: CalendarAccount;
  /** Shown beside the email when two accounts share one (Google and iCloud). */
  provider: string | null;
  calendars: CalendarInfo[];
}

const PROVIDER_NAMES: Record<CalendarAccount["provider"], string> = {
  google: "Google",
  icloud: "iCloud",
};

/** Calendars under their account, in account order; empty accounts are left out. */
export function groupByAccount(
  calendars: CalendarInfo[],
  accounts: CalendarAccount[],
): CalendarGroup[] {
  const emails = accounts.map((a) => a.email.toLowerCase());
  return accounts
    .map((account) => ({
      account,
      provider:
        emails.filter((e) => e === account.email.toLowerCase()).length > 1
          ? PROVIDER_NAMES[account.provider]
          : null,
      calendars: calendars.filter((c) => c.accountId === account.id),
    }))
    .filter((group) => group.calendars.length > 0);
}

function Swatch({ color }: { color: string | undefined }) {
  return (
    <span
      className="size-3 shrink-0 rounded-[3px]"
      style={{ background: color }}
    />
  );
}

export function CalendarPicker({
  value,
  calendars,
  accounts,
  onChange,
}: {
  value: string;
  /** The calendars that may be chosen. */
  calendars: CalendarInfo[];
  accounts: CalendarAccount[];
  onChange: (calendarId: string) => void;
}) {
  const selected = calendars.find((c) => c.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Calendar"
          className="flex h-8 w-full items-center gap-1 rounded-md pr-2.5 text-left text-13 text-white/85 outline-none transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.08] data-[state=open]:bg-white/[0.08]"
        >
          {/* Lines up with the icon column of the rows around it. */}
          <span className="flex w-8 shrink-0 justify-center">
            <Swatch color={selected?.color} />
          </span>
          <span className="min-w-0 flex-1 truncate pl-1.5">
            {selected?.name ?? "Choose a calendar"}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-white/40" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="left"
        sideOffset={8}
        collisionPadding={12}
        className="max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] min-w-56 overflow-y-auto"
      >
        {groupByAccount(calendars, accounts).map((group) => (
          <DropdownMenuGroup key={group.account.id}>
            <DropdownMenuLabel className="flex items-center gap-2 pl-8 text-12 font-normal tracking-normal text-white/45">
              <span className="truncate">{group.account.email}</span>
              {group.provider && (
                <span className="ml-auto text-11 text-white/30">
                  {group.provider}
                </span>
              )}
            </DropdownMenuLabel>
            {group.calendars.map((calendar) => (
              <DropdownMenuItem
                key={calendar.id}
                onSelect={() => onChange(calendar.id)}
                aria-checked={calendar.id === value}
                role="menuitemradio"
                className="gap-2.5"
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {calendar.id === value && (
                    <Check className="size-3.5 text-white/85" />
                  )}
                </span>
                <Swatch color={calendar.color} />
                <span className="truncate">{calendar.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

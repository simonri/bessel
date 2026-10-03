import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import { Switch } from "@bessel/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@bessel/ui/components/tooltip";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Bell,
  Check,
  ChevronRight,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui-kit";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import type {
  CalendarAccount,
  CalendarInfo,
  CalendarViewMode,
} from "./calendar-types";
import { notificationsSupported, REMINDER_MINUTES } from "./event-reminders";
import { ICloudConnectDialog } from "./icloud-connect-dialog";
import { MiniMonth } from "./mini-month";
import type { CalendarActions } from "./use-calendar-data";

const COLLAPSED_KEY = "bessel:calendar-collapsed-accounts";

function readCollapsed(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch {
    return new Set();
  }
}

/** Account ids whose calendar lists are folded away, remembered per device. */
export function useCollapsedAccounts(): [
  Set<string>,
  (accountId: string) => void,
] {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = (accountId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(accountId)) next.add(accountId);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Not remembered, but still collapses for this visit.
      }
      return next;
    });
  return [collapsed, toggle];
}

export function CalendarSidebar({
  date,
  view,
  today,
  accounts,
  calendars,
  actions,
  onSelectDate,
}: {
  date: Date;
  view: CalendarViewMode;
  today: Date;
  accounts: CalendarAccount[];
  calendars: CalendarInfo[];
  actions: CalendarActions;
  onSelectDate: (date: Date) => void;
}) {
  const [icloudOpen, setICloudOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsedAccounts();

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] px-2 py-3">
      <MiniMonth
        selected={date}
        view={view}
        today={today}
        onSelect={onSelectDate}
      />

      <div className="mt-5 space-y-4">
        {accounts.length === 0 && (
          <p className="px-2 text-11 leading-relaxed text-white/35">
            Connect a Google or iCloud account to see your calendars here.
          </p>
        )}
        {accounts.map((account) => (
          <section key={account.id}>
            <AccountHeader
              account={account}
              expanded={!collapsed.has(account.id)}
              onToggle={() => toggleCollapsed(account.id)}
              onSync={() => actions.syncAccount(account.id)}
              onReconnect={actions.connectGoogle}
              onDisconnect={() => actions.disconnectAccount(account.id)}
            />
            {calendars
              .filter(
                (c) => c.accountId === account.id && !collapsed.has(account.id),
              )
              .map((calendar) => (
                <CalendarToggle
                  key={calendar.id}
                  calendar={calendar}
                  onToggle={() =>
                    actions.setCalendarHidden(calendar.id, !calendar.hidden)
                  }
                />
              ))}
          </section>
        ))}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="mt-3 flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-left text-12 text-white/45 outline-none transition-colors duration-150 hover:bg-white/[0.05] hover:text-white/75 focus-visible:ring-1 focus-visible:ring-white/25"
          >
            <Plus className="size-3.5" />
            Add calendar account
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={actions.connectGoogle}>
            Google Calendar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setICloudOpen(true)}>
            iCloud Calendar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ReminderToggle />

      <ICloudConnectDialog
        open={icloudOpen}
        onOpenChange={setICloudOpen}
        onConnect={actions.connectICloud}
      />
    </aside>
  );
}

function ReminderToggle() {
  const { settings, update } = useSettings();
  const [permission, setPermission] = useState(() =>
    notificationsSupported() ? Notification.permission : "denied",
  );
  if (!notificationsSupported()) return null;
  const on = settings.calendarReminders && permission === "granted";

  const toggle = async () => {
    if (on) {
      update({ calendarReminders: false });
      return;
    }
    // Browsers only show the permission prompt in response to a click.
    const result =
      permission === "granted"
        ? permission
        : await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") update({ calendarReminders: true });
  };

  return (
    <div className="mt-auto pt-3">
      <div className="flex h-7 items-center gap-2.5 rounded-md px-2 text-12 text-white/55">
        <Bell className="size-3.5 shrink-0" />
        <label
          htmlFor="event-reminders"
          className="min-w-0 flex-1 cursor-pointer truncate"
        >
          Remind {REMINDER_MINUTES} min before
        </label>
        <Switch
          id="event-reminders"
          size="sm"
          checked={on}
          onCheckedChange={() => void toggle()}
        />
      </div>
      {permission === "denied" && (
        <p className="px-2 pt-1 text-11 leading-snug text-amber-200/70">
          Notifications are blocked. Allow them for Bessel in your browser or
          system settings.
        </p>
      )}
    </div>
  );
}

function AccountHeader({
  account,
  expanded,
  onToggle,
  onSync,
  onReconnect,
  onDisconnect,
}: {
  account: CalendarAccount;
  expanded: boolean;
  onToggle: () => void;
  onSync: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const status = account.syncError
    ? account.syncError
    : account.lastSyncedAt
      ? `Synced ${formatDistanceToNow(account.lastSyncedAt, { addSuffix: true })}`
      : "Syncing…";

  return (
    <div className="group flex items-center gap-1.5 pr-0.5">
      <h3 className="min-w-0 flex-1">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          title={status}
          className="flex h-6 w-full min-w-0 items-center gap-1 rounded-md pr-1 pl-2 text-left text-11 text-white/40 outline-none transition-colors duration-150 hover:text-white/70 focus-visible:ring-1 focus-visible:ring-white/25"
        >
          <span className="truncate">{account.email}</span>
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-white/30 opacity-0 transition-[transform,opacity] duration-150 group-hover:opacity-100",
              expanded && "rotate-90",
              !expanded && "opacity-100",
            )}
          />
        </button>
      </h3>
      {account.syncError ? (
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Sync problem: ${account.syncError}`}
              className="flex shrink-0 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-amber-400/60"
            >
              <AlertCircle className="size-3 text-amber-400" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6} className="max-w-60">
            {account.syncError}
          </TooltipContent>
        </Tooltip>
      ) : (
        !account.lastSyncedAt && (
          <span className="shrink-0 text-10 text-white/30">Syncing…</span>
        )
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            title="Account options"
            size="xs"
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <p className="max-w-56 px-2.5 py-1.5 text-11 text-white/40">
            {status}
          </p>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onSync}>Sync now</DropdownMenuItem>
          {account.provider === "google" && !account.canReadPeople && (
            <p className="max-w-56 px-2.5 pb-1.5 text-11 text-white/40">
              Reconnect to show guests' names and photos.
            </p>
          )}
          {account.provider === "google" && (
            // Also how newly added permissions get granted.
            <DropdownMenuItem onSelect={onReconnect}>
              Reconnect
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onSelect={onDisconnect}>
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function CalendarToggle({
  calendar,
  onToggle,
}: {
  calendar: CalendarInfo;
  onToggle: () => void;
}) {
  const visible = !calendar.hidden;
  return (
    <button
      type="button"
      aria-pressed={visible}
      onClick={onToggle}
      className="flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-left text-13 outline-none transition-colors duration-150 hover:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-white/25"
    >
      <span
        className="flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border-[1.5px]"
        style={{
          borderColor: calendar.color,
          background: visible ? calendar.color : "transparent",
        }}
      >
        {visible && (
          <Check className="size-2.5 text-black/70" strokeWidth={3.5} />
        )}
      </span>
      <span
        className={
          visible ? "truncate text-white/80" : "truncate text-white/40"
        }
      >
        {calendar.name}
      </span>
    </button>
  );
}

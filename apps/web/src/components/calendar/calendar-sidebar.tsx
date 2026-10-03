import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@bessel/ui/components/tooltip";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Check, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui-kit";
import type {
  CalendarAccount,
  CalendarInfo,
  CalendarViewMode,
} from "./calendar-types";
import { ICloudConnectDialog } from "./icloud-connect-dialog";
import { MiniMonth } from "./mini-month";
import type { CalendarActions } from "./use-calendar-data";

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
              onSync={() => actions.syncAccount(account.id)}
              onReconnect={actions.connectGoogle}
              onDisconnect={() => actions.disconnectAccount(account.id)}
            />
            {calendars
              .filter((c) => c.accountId === account.id)
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

      <ICloudConnectDialog
        open={icloudOpen}
        onOpenChange={setICloudOpen}
        onConnect={actions.connectICloud}
      />
    </aside>
  );
}

function AccountHeader({
  account,
  onSync,
  onReconnect,
  onDisconnect,
}: {
  account: CalendarAccount;
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
    <div className="group flex items-center gap-1.5 pr-0.5 pl-2">
      <h3
        className="min-w-0 flex-1 truncate text-11 text-white/40"
        title={status}
      >
        {account.email}
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
            className="size-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
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
          {account.provider === "google" && account.syncError && (
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

import type { EditScope } from "@bessel/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@bessel/ui/components/popover";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import {
  ArrowRight,
  Clock,
  ExternalLink,
  Globe,
  Lock,
  MapPin,
  MoreHorizontal,
  Repeat,
  Trash2,
  User,
  Video,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { IconButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { shortOffsetLabel } from "./calendar-timezone";
import type {
  CalendarAccount,
  CalendarEvent,
  CalendarInfo,
  Reply,
} from "./calendar-types";
import {
  cityOf,
  type EditorSubject,
  EventEditor,
  type SaveRequest,
} from "./event-editor";
import { fmtDuration, fmtTime, httpUrl, Row, Section } from "./event-fields";
import { describeRecurrence } from "./event-payload";
import { canReply, ParticipantList, RsvpBar } from "./participants";
import {
  PLACEMENT_GAP,
  useFixedPlacement,
  VIEWPORT_PADDING,
} from "./popover-placement";
import { SCOPE_LABELS } from "./scope-menu";

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "meeting";
  }
}

/** Calendar-provided text: render as text, linking only http(s) URLs. */
function Linkified({ text }: { text: string }) {
  return text.split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 0) return part;
    const trailing = part.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const url = part.slice(0, part.length - trailing.length);
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: split() parts have no identity
      <span key={i}>
        <ExternalAnchor href={url}>{url}</ExternalAnchor>
        {trailing}
      </span>
    );
  });
}

function ExternalAnchor({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "break-all text-sky-300/90 underline-offset-2 hover:underline",
        className,
      )}
    >
      {children}
    </a>
  );
}

function When({ event }: { event: CalendarEvent }) {
  if (event.allDay) {
    const start = parseISO(event.startDate);
    const last = addDays(parseISO(event.endDate), -1);
    return isSameDay(start, last) ? (
      <span className="px-1.5 text-white/85">{format(start, "EEE MMM d")}</span>
    ) : (
      <span className="flex items-center px-1.5 text-white/85">
        {format(start, "EEE MMM d")}
        <ArrowRight className="mx-2 size-3.5 text-white/30" />
        {format(last, "EEE MMM d")}
      </span>
    );
  }
  const duration = (
    <span className="ml-2 text-12 text-white/40">
      {fmtDuration(event.end.getTime() - event.start.getTime())}
    </span>
  );
  const sameDay = isSameDay(event.start, event.end);
  return (
    <>
      <span className="flex items-center px-1.5 text-white/85">
        {fmtTime(event.start)}
        <ArrowRight className="mx-2 size-3.5 text-white/30" />
        {fmtTime(event.end)}
        {duration}
      </span>
      <span className="flex w-full items-center px-1.5 leading-7 text-white/85">
        {format(event.start, "EEE MMM d")}
        {!sameDay && (
          <>
            <ArrowRight className="mx-2 size-3.5 text-white/30" />
            {format(event.end, "EEE MMM d")}
          </>
        )}
      </span>
    </>
  );
}

function Location({ location }: { location: string }) {
  if (/^https?:\/\//.test(location)) {
    return (
      <ExternalAnchor href={location} className="px-1.5 leading-7">
        {location}
      </ExternalAnchor>
    );
  }
  return (
    <ExternalAnchor
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
      className="break-words px-1.5 leading-7 text-white/85 decoration-white/30 hover:underline"
    >
      {location}
    </ExternalAnchor>
  );
}

export type ReadOnlyReason = "reconnect" | "calendar" | "invitation";

/** Why an event can't be edited, or null when it can. */
export function readOnlyReason(
  event: CalendarEvent,
  calendar: CalendarInfo | undefined,
  account: CalendarAccount | undefined,
): ReadOnlyReason | null {
  if (!account?.canWrite) return "reconnect";
  if (!calendar?.writable) return "calendar";
  if (!event.details.editable) return "invitation";
  return null;
}

/** The account was connected without edit access; reconnecting grants it.
 *  Other read-only cases (invitations, read-only calendars) explain themselves. */
function ReconnectNotice({
  account,
  onReconnect,
}: {
  account: CalendarAccount | undefined;
  onReconnect: () => void;
}) {
  return (
    <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-12 text-white/55">
      <Lock className="size-3.5 shrink-0 text-white/35" />
      <span className="min-w-0 flex-1">
        {account?.email ?? "This account"} is connected read-only.
      </span>
      {account?.provider === "google" && (
        <button
          type="button"
          onClick={onReconnect}
          className="shrink-0 rounded-md px-2 py-1 font-medium text-white/80 hover:bg-white/[0.08]"
        >
          Reconnect to edit
        </button>
      )}
    </div>
  );
}

function EventDetailsView({
  event,
  calendar,
  account,
  timeZone,
  replying,
  onReply,
}: {
  event: CalendarEvent;
  calendar: CalendarInfo | undefined;
  account: CalendarAccount | undefined;
  timeZone: string;
  replying: boolean;
  /** Set when this account can answer the invitation. */
  onReply?: (reply: Reply, scope: EditScope) => void;
}) {
  const d = event.details;
  const conferenceUrl = httpUrl(d.conferenceUrl);
  const conferenceHost = conferenceUrl ? hostOf(conferenceUrl) : null;
  return (
    <>
      <h2 className="px-4 pb-3 text-15 font-medium break-words text-white/90">
        {event.title}
      </h2>

      <Section>
        <Row icon={<Clock />}>
          <When event={event} />
        </Row>
        {event.allDay ? (
          <Row>
            <span className="px-1.5 text-white/45">All-day</span>
          </Row>
        ) : (
          <Row icon={<Globe />}>
            <span className="px-1.5">
              <span className="text-white/40">
                {shortOffsetLabel(timeZone, event.start)}
              </span>{" "}
              <span className="text-white/85">{cityOf(timeZone)}</span>
            </span>
          </Row>
        )}
        {d.recurring && (
          <Row icon={<Repeat />}>
            <span className="px-1.5 text-white/85">
              {describeRecurrence(
                d.recurrence,
                event.allDay ? parseISO(event.startDate) : event.start,
              )}
            </span>
          </Row>
        )}
      </Section>

      {(d.creatorEmail || d.attendees.length > 0) && (
        <Section>
          {d.attendees.length > 0 ? (
            <ParticipantList attendees={d.attendees} />
          ) : (
            <Row icon={<User />}>
              <p className="w-full truncate px-1.5 leading-7 text-white/85">
                Created by{" "}
                <span className="text-white/45" title={d.creatorEmail ?? ""}>
                  {d.creatorName ?? d.creatorEmail}
                </span>
              </p>
            </Row>
          )}
          {onReply && d.myResponse && (
            <Row>
              <div className="w-full">
                <RsvpBar
                  value={d.myResponse}
                  recurring={d.recurring}
                  disabled={replying}
                  onReply={onReply}
                />
              </div>
            </Row>
          )}
        </Section>
      )}

      {(conferenceUrl || d.location) && (
        <Section>
          {conferenceUrl && (
            <Row icon={<Video />}>
              <a
                href={conferenceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="ml-1.5 inline-flex h-7 items-center rounded-md bg-sky-500/15 px-2.5 text-12 font-medium text-sky-200 transition-colors hover:bg-sky-500/25"
              >
                Join {conferenceHost}
              </a>
            </Row>
          )}
          {d.location && d.location !== conferenceUrl && (
            <Row icon={<MapPin />}>
              <Location location={d.location} />
            </Row>
          )}
        </Section>
      )}

      {d.description && (
        <Section>
          <p className="max-h-56 overflow-y-auto px-2.5 py-1.5 text-13 leading-relaxed break-words whitespace-pre-wrap text-white/70">
            <Linkified text={d.description} />
          </p>
        </Section>
      )}

      <Section>
        <Row
          icon={
            <span
              className="size-3 rounded-[3px]"
              style={{ background: calendar?.color }}
            />
          }
        >
          <span className="truncate px-1.5 text-white/85">
            {calendar?.name ?? "Calendar"}
          </span>
          {account &&
            account.email.toLowerCase() !== calendar?.name.toLowerCase() && (
              <span className="truncate text-12 text-white/40">
                {account.email}
              </span>
            )}
        </Row>
        <Row>
          <span className="px-1.5 text-white/85">
            {d.busy ? "Busy" : "Free"}
          </span>
          {d.visibility && d.visibility !== "public" && (
            <span className="ml-4 flex items-center gap-1 text-white/55 capitalize">
              <Lock className="size-3" />
              {d.visibility}
            </span>
          )}
        </Row>
      </Section>
    </>
  );
}

/** The delete awaiting confirmation; `scope` is set for repeating events. */
interface PendingDelete {
  scope?: EditScope;
}

function DeleteConfirm({
  pending,
  canNotify,
  onConfirm,
  onCancel,
}: {
  pending: PendingDelete;
  /** Guests are on the event and the provider can email them. */
  canNotify: boolean;
  onConfirm: (notifyGuests: boolean) => void;
  onCancel: () => void;
}) {
  const [notify, setNotify] = useState(true);
  const what = pending.scope
    ? SCOPE_LABELS[pending.scope].toLowerCase()
    : "this event";
  return (
    <div className="mx-4 mb-3 space-y-2 rounded-lg bg-red-500/10 px-3 py-2 text-12 text-red-100/90">
      <div className="flex items-center gap-2">
        <span className="flex-1">Delete {what}?</span>
        <button
          type="button"
          onClick={() => onConfirm(canNotify && notify)}
          className="rounded-md bg-red-500/20 px-2 py-1 font-medium text-red-200 hover:bg-red-500/30"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-white/60 hover:bg-white/[0.06]"
        >
          Cancel
        </button>
      </div>
      {canNotify && (
        <label className="flex w-fit cursor-pointer items-center gap-1.5 text-white/60">
          <input
            type="checkbox"
            className="accent-primary-500"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          Email guests about the cancellation
        </label>
      )}
    </div>
  );
}

export function EventPopover({
  subject,
  anchor,
  calendars,
  writableCalendars,
  accounts,
  timeZone,
  saving,
  onSave,
  onDelete,
  onReply,
  replying,
  onReconnect,
  onClose,
  onDirtyChange,
}: {
  /** The event (or new-event draft) to show; null hides the popover. */
  subject: EditorSubject | null;
  anchor: HTMLElement | null;
  calendars: CalendarInfo[];
  /** Calendars events can be saved to (writable, in accounts that can write). */
  writableCalendars: CalendarInfo[];
  accounts: CalendarAccount[];
  /** The zone the calendar shows times in. */
  timeZone: string;
  saving: boolean;
  onSave: (request: SaveRequest) => void;
  onDelete: (scope: EditScope | undefined, notifyGuests: boolean) => void;
  /** Answers the shown invitation. */
  onReply: (reply: Reply, scope: EditScope) => void;
  replying: boolean;
  onReconnect: () => void;
  onClose: () => void;
  /** Unsaved edits are open; the page holds off switching events meanwhile. */
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  // The popover outlives each event it shows; start every event clean.
  const subjectKey = subject
    ? (subject.event?.id ?? `new:${subject.timing.start.getTime()}`)
    : null;
  const [shownKey, setShownKey] = useState(subjectKey);
  if (shownKey !== subjectKey) {
    setShownKey(subjectKey);
    setDirty(false);
    setConfirmDiscard(false);
    setPendingDelete(null);
  }
  const event = subject?.event ?? null;
  const calendar = calendars.find((c) => c.id === subject?.calendarId);
  const account = accounts.find((a) => a.id === calendar?.accountId);
  const reason = event ? readOnlyReason(event, calendar, account) : null;
  const editing = subject !== null && reason === null;
  const recurring = event?.details.recurring ?? false;
  const googleLink =
    account?.provider === "google" ? httpUrl(event?.details.htmlLink) : null;
  const canDelete = editing && event !== null;
  const replyable =
    event !== null &&
    canReply(event.details.attendees) &&
    account?.canWrite === true &&
    calendar?.writable === true;

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const placement = useFixedPlacement(anchor, content);

  return (
    <Popover
      open={subject !== null && anchor !== null}
      onOpenChange={(open) => !open && requestClose()}
    >
      {anchor && <PopoverAnchor virtualRef={{ current: anchor }} />}
      {subject && (
        <PopoverContent
          side={placement?.side ?? "right"}
          align="start"
          sideOffset={PLACEMENT_GAP}
          alignOffset={placement?.alignOffset ?? 0}
          // Placed once on open (centred, on screen); afterwards it follows
          // the event while scrolling rather than sliding to stay in view.
          avoidCollisions={false}
          className={cn(
            "w-[360px] overflow-hidden rounded-xl border-white/10 p-0 shadow-2xl",
            !placement && "invisible",
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
          // The chip is outside the popover; let its own click toggle instead
          // of closing here and immediately reopening.
          onInteractOutside={(e) => {
            const target = e.target as Element | null;
            // The chip toggles itself; menus and selects opened from the
            // editor render in their own portals but are part of it.
            if (
              anchor?.contains(target) ||
              target?.closest?.("[data-radix-popper-content-wrapper]")
            ) {
              e.preventDefault();
            }
          }}
        >
          <div
            ref={setContent}
            className="flex flex-col"
            style={{
              maxHeight: `min(680px, calc(100vh - ${2 * VIEWPORT_PADDING}px))`,
            }}
          >
            <div className="flex shrink-0 items-center gap-1 py-2 pr-2 pl-4">
              <span className="flex-1 text-12 text-white/45">
                {event ? "Event" : "New event"}
              </span>
              {(googleLink || canDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton title="More actions">
                      <MoreHorizontal />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    {googleLink && (
                      <DropdownMenuItem
                        onSelect={() => window.open(googleLink, "_blank")}
                      >
                        <ExternalLink />
                        Open in Google Calendar
                      </DropdownMenuItem>
                    )}
                    {googleLink && canDelete && <DropdownMenuSeparator />}
                    {canDelete &&
                      (recurring ? (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="text-red-300 [&_svg]:text-red-300">
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {(["this", "following", "all"] as const).map(
                              (scope) => (
                                <DropdownMenuItem
                                  key={scope}
                                  variant="destructive"
                                  onSelect={() => setPendingDelete({ scope })}
                                >
                                  {SCOPE_LABELS[scope]}
                                </DropdownMenuItem>
                              ),
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ) : (
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setPendingDelete({})}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <IconButton title="Close" onClick={requestClose}>
                <X />
              </IconButton>
            </div>

            {confirmDiscard && (
              <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-12 text-amber-200/90">
                <span className="flex-1">Discard unsaved changes?</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDiscard(false);
                    setDirty(false);
                    onClose();
                  }}
                  className="rounded-md px-2 py-1 font-medium hover:bg-amber-500/15"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="rounded-md px-2 py-1 text-white/60 hover:bg-white/[0.06]"
                >
                  Keep editing
                </button>
              </div>
            )}

            {pendingDelete && event && (
              <DeleteConfirm
                key={pendingDelete.scope ?? "one"}
                pending={pendingDelete}
                canNotify={
                  account?.provider === "google" &&
                  event.details.attendees.length > 0
                }
                onConfirm={(notifyGuests) => {
                  setPendingDelete(null);
                  onDelete(pendingDelete.scope, notifyGuests);
                }}
                onCancel={() => setPendingDelete(null)}
              />
            )}

            <div className="min-h-0 overflow-y-auto">
              {editing ? (
                <EventEditor
                  key={subjectKey ?? undefined}
                  subject={subject}
                  calendars={writableCalendars}
                  accounts={accounts}
                  timeZone={timeZone}
                  saving={saving}
                  onSave={onSave}
                  replying={replying}
                  onReply={replyable ? onReply : undefined}
                  onCancel={() => {
                    setDirty(false);
                    onClose();
                  }}
                  onDirtyChange={setDirty}
                />
              ) : (
                event && (
                  <>
                    {reason === "reconnect" && (
                      <ReconnectNotice
                        account={account}
                        onReconnect={onReconnect}
                      />
                    )}
                    <EventDetailsView
                      event={event}
                      calendar={calendar}
                      account={account}
                      timeZone={timeZone}
                      replying={replying}
                      onReply={replyable ? onReply : undefined}
                    />
                  </>
                )
              )}
            </div>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

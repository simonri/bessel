import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@bessel/ui/components/popover";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import {
  Check,
  Circle,
  Clock,
  ExternalLink,
  HelpCircle,
  Lock,
  MapPin,
  Repeat,
  Users,
  Video,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type {
  CalendarAccount,
  CalendarAttendee,
  CalendarEvent,
  CalendarInfo,
} from "./calendar-types";

const MAX_GUESTS_SHOWN = 8;
const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

const RESPONSE_META: Record<
  CalendarAttendee["response"],
  { label: string; icon: ReactNode }
> = {
  accepted: {
    label: "Going",
    icon: <Check className="size-3 text-emerald-400" strokeWidth={3} />,
  },
  declined: {
    label: "Declined",
    icon: <X className="size-3 text-red-400" strokeWidth={3} />,
  },
  tentative: {
    label: "Maybe",
    icon: <HelpCircle className="size-3 text-amber-400" />,
  },
  needs_action: {
    label: "Awaiting",
    icon: <Circle className="size-2.5 text-white/30" />,
  },
};

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "meeting";
  }
}

function fmtTime(d: Date): string {
  return format(d, d.getMinutes() === 0 ? "h a" : "h:mm a");
}

function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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

function Section({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-2 border-t border-white/[0.07] px-4 py-3">
      {children}
    </div>
  );
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-13">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-white/40 [&_svg]:size-3.5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function When({ event }: { event: CalendarEvent }) {
  if (event.allDay) {
    const start = parseISO(event.startDate);
    const last = addDays(parseISO(event.endDate), -1);
    return (
      <>
        <p className="text-white/85">
          {isSameDay(start, last)
            ? format(start, "EEE MMM d")
            : `${format(start, "EEE MMM d")} → ${format(last, "EEE MMM d")}`}
        </p>
        <p className="mt-0.5 text-12 text-white/45">All day</p>
      </>
    );
  }
  const duration = (
    <span className="text-white/45">
      {fmtDuration(event.end.getTime() - event.start.getTime())}
    </span>
  );
  if (!isSameDay(event.start, event.end)) {
    return (
      <p className="text-white/85">
        {format(event.start, "EEE MMM d")}, {fmtTime(event.start)} →{" "}
        {format(event.end, "EEE MMM d")}, {fmtTime(event.end)} {duration}
      </p>
    );
  }
  return (
    <>
      <p className="text-white/85">
        {fmtTime(event.start)} → {fmtTime(event.end)} {duration}
      </p>
      <p className="mt-0.5 text-12 text-white/45">
        {format(event.start, "EEE MMM d")}
      </p>
    </>
  );
}

function Guests({ attendees }: { attendees: CalendarAttendee[] }) {
  const going = attendees.filter((a) => a.response === "accepted").length;
  const shown = attendees.slice(0, MAX_GUESTS_SHOWN);
  return (
    <div className="space-y-1">
      <p className="text-12 text-white/45">
        {attendees.length} {attendees.length === 1 ? "guest" : "guests"} ·{" "}
        {going} going
      </p>
      <ul className="space-y-1">
        {shown.map((a) => (
          <li
            key={a.email}
            className="flex items-center gap-2"
            title={RESPONSE_META[a.response].label}
          >
            <span className="flex size-3 shrink-0 items-center justify-center">
              {RESPONSE_META[a.response].icon}
            </span>
            <span className="truncate text-white/75">{a.name ?? a.email}</span>
          </li>
        ))}
      </ul>
      {attendees.length > shown.length && (
        <p className="text-12 text-white/40">
          and {attendees.length - shown.length} more
        </p>
      )}
    </div>
  );
}

function Location({ location }: { location: string }) {
  if (/^https?:\/\//.test(location)) {
    return <ExternalAnchor href={location}>{location}</ExternalAnchor>;
  }
  return (
    <ExternalAnchor
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
      className="break-words text-white/80 decoration-white/30 hover:underline"
    >
      {location}
    </ExternalAnchor>
  );
}

export function EventDetailsPopover({
  event,
  anchor,
  calendar,
  account,
  onClose,
}: {
  event: CalendarEvent | null;
  anchor: HTMLElement | null;
  calendar: CalendarInfo | undefined;
  account: CalendarAccount | undefined;
  onClose: () => void;
}) {
  const d = event?.details;
  const conferenceHost = d?.conferenceUrl ? hostOf(d.conferenceUrl) : null;

  return (
    <Popover
      open={event !== null && anchor !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {anchor && <PopoverAnchor virtualRef={{ current: anchor }} />}
      {event && d && (
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="w-[340px] overflow-hidden rounded-xl border-white/10 p-0 shadow-2xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
          // The chip is outside the popover; let its own click toggle instead
          // of closing here and immediately reopening.
          onInteractOutside={(e) => {
            if (anchor?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          <div className="flex max-h-[min(640px,var(--radix-popover-content-available-height))] flex-col">
            <div className="flex shrink-0 items-center gap-1 py-2 pr-2 pl-4">
              <span className="flex-1 text-12 text-white/45">Event</span>
              {d.htmlLink && account?.provider === "google" && (
                <IconButton
                  title="Open in Google Calendar"
                  onClick={() => window.open(d.htmlLink ?? "", "_blank")}
                >
                  <ExternalLink />
                </IconButton>
              )}
              <IconButton title="Close" onClick={onClose}>
                <X />
              </IconButton>
            </div>

            <div className="min-h-0 overflow-y-auto">
              <h2 className="px-4 pb-3 text-15 font-medium break-words text-white/90">
                {event.title}
              </h2>

              <Section>
                <Row icon={<Clock />}>
                  <When event={event} />
                </Row>
                {d.recurring && (
                  <Row icon={<Repeat />}>
                    <span className="text-white/60">Repeats</span>
                  </Row>
                )}
              </Section>

              {(d.creatorEmail || d.attendees.length > 0) && (
                <Section>
                  <Row icon={<Users />}>
                    {d.creatorEmail && (
                      <p className="mb-1.5 truncate text-white/80">
                        Created by{" "}
                        <span className="text-white/50" title={d.creatorEmail}>
                          {d.creatorName ?? d.creatorEmail}
                        </span>
                      </p>
                    )}
                    {d.attendees.length > 0 && (
                      <Guests attendees={d.attendees} />
                    )}
                  </Row>
                </Section>
              )}

              {(d.conferenceUrl || d.location) && (
                <Section>
                  {d.conferenceUrl && (
                    <Row icon={<Video />}>
                      <a
                        href={d.conferenceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex h-7 items-center rounded-md bg-sky-500/15 px-2.5 text-12 font-medium text-sky-200 transition-colors hover:bg-sky-500/25"
                      >
                        Join {conferenceHost}
                      </a>
                    </Row>
                  )}
                  {d.location && d.location !== d.conferenceUrl && (
                    <Row icon={<MapPin />}>
                      <Location location={d.location} />
                    </Row>
                  )}
                </Section>
              )}

              {d.description && (
                <Section>
                  <p className="max-h-56 overflow-y-auto text-13 leading-relaxed break-words whitespace-pre-wrap text-white/70">
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
                  <p className="truncate text-white/85">
                    {calendar?.name ?? "Calendar"}
                  </p>
                  {account && (
                    <p className="truncate text-12 text-white/40">
                      {account.email}
                    </p>
                  )}
                </Row>
                <div className="flex gap-4 pl-7 text-12 text-white/55">
                  <span>{d.busy ? "Busy" : "Free"}</span>
                  {d.visibility && d.visibility !== "public" && (
                    <span className="flex items-center gap-1 capitalize">
                      <Lock className="size-3" />
                      {d.visibility}
                    </span>
                  )}
                </div>
              </Section>
            </div>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

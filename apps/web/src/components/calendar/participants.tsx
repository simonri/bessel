import type { EditScope } from "@bessel/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  HelpCircle,
  User,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  AttendeeResponse,
  CalendarAttendee,
  Reply,
} from "./calendar-types";
import { plainControlClass, plainFieldClass, Row } from "./event-fields";
import { displayName, photoOf, suggestPeople, usePeople } from "./people";
import { SCOPE_LABELS } from "./scope-menu";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_SHOWN = 8;

// Muted backgrounds that keep white initials readable.
const AVATAR_COLORS = [
  "#8a6d3b",
  "#5b7a99",
  "#7a5c99",
  "#4f8a6b",
  "#99605b",
  "#5b8a8a",
  "#80794d",
  "#6b6b99",
];

function hash(value: string): number {
  let h = 0;
  for (const char of value) h = (h * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function avatarColor(email: string): string {
  return AVATAR_COLORS[hash(email.toLowerCase()) % AVATAR_COLORS.length];
}

export function initialOf(
  attendee: Pick<CalendarAttendee, "name" | "email">,
): string {
  const source = attendee.name?.trim() || attendee.email;
  return (source.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
}

const BADGES: Partial<
  Record<
    AttendeeResponse,
    { icon: ReactNode; className: string; label: string }
  >
> = {
  accepted: {
    icon: <Check strokeWidth={4} />,
    className: "bg-emerald-500",
    label: "Going",
  },
  declined: {
    icon: <X strokeWidth={4} />,
    className: "bg-red-500",
    label: "Declined",
  },
  tentative: {
    icon: <HelpCircle strokeWidth={3} />,
    className: "bg-amber-500",
    label: "Maybe",
  },
};

export function Avatar({
  attendee,
  name,
  photoUrl,
}: {
  attendee: Pick<CalendarAttendee, "email" | "response">;
  /** The name shown beside it, for the initial. */
  name: string | null;
  photoUrl?: string | null;
}) {
  const badge = BADGES[attendee.response];
  const [broken, setBroken] = useState<string | null>(null);
  const showPhoto = photoUrl && broken !== photoUrl;
  return (
    <span className="relative flex size-5 shrink-0">
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          // Google's photo host refuses some requests that carry a referrer.
          referrerPolicy="no-referrer"
          onError={() => setBroken(photoUrl)}
          className="size-5 rounded-full object-cover"
        />
      ) : (
        <span
          className="flex size-5 items-center justify-center rounded-full text-10 font-semibold text-white/90"
          style={{ background: avatarColor(attendee.email) }}
        >
          {initialOf({ name, email: attendee.email })}
        </span>
      )}
      {badge && (
        <span
          role="img"
          aria-label={badge.label}
          className={cn(
            "absolute -right-1 -bottom-0.5 flex size-2.5 items-center justify-center rounded-full text-white ring-[1.5px] ring-popover [&_svg]:size-[7px]",
            badge.className,
          )}
        >
          {badge.icon}
        </span>
      )}
    </span>
  );
}

/** "4 yes, 1 awaiting": only the answers someone gave. */
export function responseSummary(attendees: CalendarAttendee[]): string {
  const count = (response: AttendeeResponse) =>
    attendees.filter((a) => a.response === response).length;
  return (
    [
      [count("accepted"), "yes"],
      [count("declined"), "no"],
      [count("tentative"), "maybe"],
      [count("needs_action"), "awaiting"],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(", ");
}

/** Organizer first, then everyone else in the provider's order. */
function ordered(attendees: CalendarAttendee[]): CalendarAttendee[] {
  return [
    ...attendees.filter((a) => a.isOrganizer),
    ...attendees.filter((a) => !a.isOrganizer),
  ];
}

/** Someone on the panel's icon grid: the avatar sits in the icon column, the
 *  name in the text column, and the email slides out on hover. */
const rowButtonClass =
  "flex size-6 shrink-0 items-center justify-center rounded-md text-white/40 outline-none transition-[opacity,colors] hover:bg-white/[0.08] hover:text-white/85 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-white/25 [&_svg]:size-3.5";

export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true));
      }}
      className={cn(rowButtonClass, className)}
    >
      {copied ? <Check className="text-emerald-400" /> : <Copy />}
    </button>
  );
}

export function PersonRow({
  attendee,
  detail,
  action,
  highlighted,
  showEmail = false,
  className,
}: {
  attendee: Pick<CalendarAttendee, "email" | "name" | "response"> & {
    photoUrl?: string | null;
  };
  /** A second line under the name, e.g. "Organizer". */
  detail?: string;
  action?: ReactNode;
  highlighted?: boolean;
  /** Always show the address (suggestions); otherwise a button reveals it. */
  showEmail?: boolean;
  className?: string;
}) {
  const people = usePeople();
  const name = displayName(attendee, people);
  const photoUrl = photoOf(
    { ...attendee, photoUrl: attendee.photoUrl ?? null },
    people,
  );
  const [expanded, setExpanded] = useState(false);
  const emailShown = name !== null && (showEmail || expanded);
  // Controls appear on hover; an expanded row keeps its collapse button.
  const hoverOnly = "opacity-0 group-hover/person:opacity-100";
  return (
    <div
      className={cn(
        "group/person flex min-h-8 items-start gap-1 rounded-md text-13",
        highlighted && "bg-white/[0.06]",
        className,
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">
        <Avatar attendee={attendee} name={name} photoUrl={photoUrl} />
      </span>
      <span className="min-w-0 flex-1 px-1.5 py-1.5">
        <span className="block truncate leading-5 text-white/85">
          {name ?? attendee.email}
        </span>
        {detail && (
          <span className="block text-12 leading-4 text-white/40">
            {detail}
          </span>
        )}
        {emailShown && (
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-12 leading-4 text-white/40">
              {attendee.email}
            </span>
            {!showEmail && (
              <CopyButton
                value={attendee.email}
                label="Copy email"
                className="size-5 [&_svg]:size-3"
              />
            )}
          </span>
        )}
      </span>
      {!showEmail && (
        <span className="flex h-8 shrink-0 items-center gap-0.5 pr-1">
          {name === null && (
            <CopyButton
              value={attendee.email}
              label="Copy email"
              className={hoverOnly}
            />
          )}
          {name !== null && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? "Hide email" : "Show email"}
              title={expanded ? "Hide email" : "Show email"}
              onClick={() => setExpanded((open) => !open)}
              className={cn(rowButtonClass, !expanded && hoverOnly)}
            >
              {expanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
            </button>
          )}
          {action}
        </span>
      )}
    </div>
  );
}

function ParticipantsHeader({ attendees }: { attendees: CalendarAttendee[] }) {
  return (
    <Row icon={<User />}>
      <span className="px-1.5">
        <span className="text-white/85">
          {attendees.length}{" "}
          {attendees.length === 1 ? "participant" : "participants"}
        </span>
        <span className="ml-2 text-12 text-white/40">
          {responseSummary(attendees)}
        </span>
      </span>
    </Row>
  );
}

export function ParticipantList({
  attendees,
}: {
  attendees: CalendarAttendee[];
}) {
  const [showAll, setShowAll] = useState(false);
  const all = ordered(attendees);
  const shown = showAll ? all : all.slice(0, MAX_SHOWN);
  return (
    <>
      <ParticipantsHeader attendees={attendees} />
      <ul aria-label="Participants">
        {shown.map((attendee) => (
          <li key={attendee.email}>
            <PersonRow
              attendee={attendee}
              detail={attendee.isOrganizer ? "Organizer" : undefined}
            />
          </li>
        ))}
      </ul>
      {all.length > shown.length && (
        <Row>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={cn(plainControlClass, "text-white/45")}
          >
            Show all {all.length}
          </button>
        </Row>
      )}
    </>
  );
}

/** The guest list of an event being edited: remove people, and add them by
 *  typing a name or email, with suggestions from people on other events. */
export function ParticipantEditor({
  emails,
  known,
  onChange,
}: {
  emails: string[];
  /** The event's synced guests, for names and answers. */
  known: CalendarAttendee[];
  onChange: (emails: string[]) => void;
}) {
  const people = usePeople();
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(0);
  const rows = emails.map(
    (email): CalendarAttendee =>
      known.find((a) => a.email.toLowerCase() === email) ?? {
        email,
        name: null,
        response: "needs_action",
        isSelf: false,
        isOrganizer: false,
        photoUrl: null,
      },
  );
  const suggestions = suggestPeople(people, draft, emails);
  const typed = draft.trim().toLowerCase();
  const invalid =
    typed !== "" && !EMAIL.test(typed) && suggestions.length === 0;

  const add = (email: string) => {
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) return;
    if (!emails.includes(address)) onChange([...emails, address]);
    setDraft("");
    setActive(0);
  };

  return (
    <>
      {rows.length > 0 && <ParticipantsHeader attendees={rows} />}
      <ul aria-label="Participants">
        {ordered(rows).map((attendee) => (
          <li key={attendee.email}>
            <PersonRow
              attendee={attendee}
              detail={attendee.isOrganizer ? "Organizer" : undefined}
              action={
                <button
                  type="button"
                  aria-label={`Remove ${attendee.email}`}
                  onClick={() =>
                    onChange(emails.filter((e) => e !== attendee.email))
                  }
                  className={cn(
                    rowButtonClass,
                    "opacity-0 group-hover/person:opacity-100",
                  )}
                >
                  <X />
                </button>
              }
            />
          </li>
        ))}
      </ul>
      <Row icon={rows.length === 0 ? <User /> : undefined}>
        <input
          className={cn(plainFieldClass, invalid && "text-red-300")}
          placeholder="Add participant"
          aria-label="Add participant"
          aria-invalid={invalid}
          aria-expanded={suggestions.length > 0}
          aria-controls="participant-suggestions"
          role="combobox"
          aria-autocomplete="list"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && suggestions.length) {
              e.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
            } else if (e.key === "ArrowUp" && suggestions.length) {
              e.preventDefault();
              setActive(
                (i) => (i - 1 + suggestions.length) % suggestions.length,
              );
            } else if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
              const pick = suggestions[active]?.email ?? draft;
              if (!pick.trim() || (e.key === "Tab" && !suggestions.length)) {
                return;
              }
              e.preventDefault();
              add(pick);
            } else if (e.key === "Escape" && draft) {
              e.stopPropagation();
              setDraft("");
            } else if (e.key === "Backspace" && !draft && emails.length) {
              onChange(emails.slice(0, -1));
            }
          }}
        />
      </Row>
      {suggestions.length > 0 && (
        <div
          id="participant-suggestions"
          role="listbox"
          aria-label="Suggestions"
        >
          {suggestions.map((person, i) => (
            <button
              key={person.email}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              // Keep focus in the input so typing can continue.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(person.email)}
              onMouseEnter={() => setActive(i)}
              className="block w-full text-left"
            >
              <PersonRow
                attendee={{ ...person, response: "needs_action" }}
                highlighted={i === active}
                showEmail
              />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const REPLIES: { reply: Reply; label: string }[] = [
  { reply: "accepted", label: "Yes" },
  { reply: "declined", label: "No" },
  { reply: "tentative", label: "Maybe" },
];

const segmentClass =
  "h-7 flex-1 rounded-md text-12 font-medium outline-none transition-colors focus-visible:ring-1 focus-visible:ring-white/25 disabled:pointer-events-none";

/** Yes / No / Maybe for an invitation; repeating events ask which ones. */
export function RsvpBar({
  value,
  recurring,
  disabled,
  onReply,
}: {
  value: AttendeeResponse;
  recurring: boolean;
  disabled?: boolean;
  onReply: (reply: Reply, scope: EditScope) => void;
}) {
  return (
    <fieldset
      aria-label="Going?"
      className="mx-1.5 mt-1 flex min-w-0 gap-0.5 rounded-lg border-0 bg-white/[0.05] p-0.5"
    >
      {REPLIES.map(({ reply, label }) => {
        const className = cn(
          segmentClass,
          value === reply
            ? "bg-white/[0.12] text-white"
            : "text-white/60 hover:bg-white/[0.06] hover:text-white/85",
        );
        if (!recurring) {
          return (
            <button
              key={reply}
              type="button"
              aria-pressed={value === reply}
              disabled={disabled}
              onClick={() => onReply(reply, "this")}
              className={className}
            >
              {label}
            </button>
          );
        }
        return (
          <DropdownMenu key={reply}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-pressed={value === reply}
                disabled={disabled}
                className={className}
              >
                {label}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {(["this", "all"] as const).map((scope) => (
                <DropdownMenuItem
                  key={scope}
                  onSelect={() => onReply(reply, scope)}
                >
                  {SCOPE_LABELS[scope]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </fieldset>
  );
}

/** Whether this account can answer: it's a guest, not the organizer. */
export function canReply(attendees: CalendarAttendee[]): boolean {
  const self = attendees.find((a) => a.isSelf);
  return self !== undefined && !self.isOrganizer;
}

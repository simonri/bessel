import type {
  ContactInteractionKind,
  ContactInteractionSchema,
  ContactSchema,
} from "@bessel/client";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  Eye,
  MessageSquare,
  Phone,
  StickyNote,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { apiDay, daysAgo, describeLastSeen } from "./contact-meta";
import { Section } from "./contact-section";
import { useContactLog } from "./use-contact-log";

const KINDS: { kind: ContactInteractionKind; label: string }[] = [
  { kind: "met", label: "Met" },
  { kind: "call", label: "Call" },
  { kind: "message", label: "Message" },
  { kind: "note", label: "Note" },
];

const KIND_ICON: Record<
  ContactInteractionKind,
  React.ComponentType<{ className?: string }>
> = {
  met: Users,
  call: Phone,
  message: MessageSquare,
  event: CalendarDays,
  note: StickyNote,
};

function Entry({
  entry,
  today,
  onDelete,
}: {
  entry: ContactInteractionSchema;
  today: string;
  onDelete?: () => void;
}) {
  const Icon = KIND_ICON[entry.kind];
  const day = apiDay(entry.occurred_on);
  return (
    <li className="group flex items-start gap-2.5 py-1.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-white/35" />
      <div className="min-w-0 flex-1">
        {entry.event_title && (
          <p className="text-13 text-white/85">{entry.event_title}</p>
        )}
        {entry.note && (
          <p className="whitespace-pre-wrap text-13 text-white/75">
            {entry.note}
          </p>
        )}
        {!entry.event_title && !entry.note && (
          <p className="text-13 text-white/60">
            {KINDS.find((k) => k.kind === entry.kind)?.label ?? "Met"}
          </p>
        )}
        <p className="text-11 text-white/35">
          <time dateTime={day} title={format(parseISO(day), "d MMMM yyyy")}>
            {daysAgo(day, today)}
          </time>
          {entry.source === "calendar" && " - from your calendar"}
          {entry.source === "assistant" && " - logged by Claude"}
        </p>
      </div>
      {onDelete && (
        <button
          type="button"
          aria-label="Delete entry"
          onClick={onDelete}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-white/30 opacity-0 transition-opacity hover:bg-white/10 hover:text-white/70 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </li>
  );
}

/** Bessel's own layer on a contact: what happened with them, and tags. None of it goes to Google. */
export function LogPanel({
  contact,
  today,
  knownTags,
  onTags,
}: {
  contact: ContactSchema;
  /** The local day as "yyyy-mm-dd". */
  today: string;
  knownTags: string[];
  onTags: (tags: string[]) => void;
}) {
  const { entries, log, logging, remove } = useContactLog(contact.id);
  const [kind, setKind] = useState<ContactInteractionKind>("met");
  const [note, setNote] = useState("");
  const [draftTag, setDraftTag] = useState("");
  const listId = useId();

  const submit = () => {
    void log({ kind, note: note.trim() || null }).then(
      () => setNote(""),
      () => {},
    );
  };
  const addTag = () => {
    const tag = draftTag.trim();
    setDraftTag("");
    if (!tag || contact.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
      return;
    onTags([...contact.tags, tag]);
  };

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-white/[0.03] px-5 py-5 ring-1 ring-white/[0.06]">
      <Section icon={Eye} title="Log">
        <p className="mb-2.5 text-13 text-white/85">
          {describeLastSeen(contact.last_seen, today)}
        </p>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            aria-label="What happened?"
            placeholder="What happened? Anything to remember?"
            value={note}
            rows={2}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            className="w-full resize-none rounded-lg bg-white/[0.05] px-3 py-2 text-13 text-white/85 ring-1 ring-white/[0.08] outline-none placeholder:text-white/30 focus:ring-primary-400/40"
          />
          <div className="flex items-center justify-between gap-2">
            <fieldset aria-label="Kind" className="flex gap-1">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  aria-pressed={kind === k.kind}
                  onClick={() => setKind(k.kind)}
                  className={cn(
                    "h-6 rounded-full px-2.5 text-11 font-medium ring-1 transition-colors duration-150",
                    kind === k.kind
                      ? "bg-white/[0.1] text-white/90 ring-white/15"
                      : "text-white/50 ring-white/[0.06] hover:bg-white/[0.05] hover:text-white/80",
                  )}
                >
                  {k.label}
                </button>
              ))}
            </fieldset>
            <button
              type="submit"
              disabled={logging}
              className="flex h-7 items-center rounded-full bg-primary-500 px-3.5 text-12 font-medium text-white transition-colors hover:bg-primary-400 disabled:opacity-50"
            >
              Log
            </button>
          </div>
        </form>
        {entries.length > 0 && (
          <ul
            aria-label="Timeline"
            className="mt-3 divide-y divide-white/[0.04]"
          >
            {entries.map((entry) => (
              <Entry
                key={
                  entry.id ??
                  `calendar-${entry.occurred_on.toISOString()}-${entry.event_title}`
                }
                entry={entry}
                today={today}
                onDelete={
                  entry.id ? () => remove(entry.id as string) : undefined
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <Section icon={Tag} title="Tags">
        <div className="flex flex-wrap items-center gap-1.5">
          {contact.tags.map((tag) => (
            <span
              key={tag}
              className="flex h-6 items-center gap-1 rounded-full bg-white/[0.06] pr-1 pl-2.5 text-12 text-white/80 ring-1 ring-white/[0.08]"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => onTags(contact.tags.filter((t) => t !== tag))}
                className="flex size-4 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white/80"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            aria-label="Add tag"
            placeholder="Add tag"
            list={listId}
            value={draftTag}
            maxLength={50}
            onChange={(e) => setDraftTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            className="h-6 w-24 rounded-full bg-transparent px-2 text-12 text-white/80 outline-none placeholder:text-white/30 focus:bg-white/[0.05]"
          />
          <datalist id={listId}>
            {knownTags
              .filter((t) => !contact.tags.includes(t))
              .map((t) => (
                <option key={t} value={t} />
              ))}
          </datalist>
        </div>
      </Section>
    </div>
  );
}

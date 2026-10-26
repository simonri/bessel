import type {
  ContactMethodSchema,
  ContactSchema,
  ContactSourceSchema,
} from "@bessel/client";
import { formatDistanceToNow } from "date-fns";
import {
  Cake,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { IconButton } from "@/components/ui-kit";
import { useLocalDay } from "@/lib/local-day";
import { cn } from "@/lib/utils";
import { ContactEditor } from "./contact-editor";
import { KeepUpPanel } from "./contact-keep-up";
import {
  describeBirthday,
  groupByLetter,
  initials,
  isCatchUpDue,
  mapsUrl,
  matchesContact,
  telUrl,
} from "./contact-meta";
import { Section } from "./contact-section";
import { useCatchUpTask } from "./use-catch-up-task";
import { useContacts } from "./use-contacts";

/** The list filter: everyone, people it's time to catch up with, or one tag. */
type Filter = { kind: "all" } | { kind: "due" } | { kind: "tag"; tag: string };

function hue(name: string): number {
  let h = 0;
  for (const char of name) h = (h * 31 + char.charCodeAt(0)) % 360;
  return h;
}

function Avatar({
  contact,
  size,
}: {
  contact: Pick<ContactSchema, "display_name" | "photo_url">;
  size: "sm" | "lg";
}) {
  const box = size === "lg" ? "size-20 text-2xl" : "size-8 text-12";
  if (contact.photo_url) {
    return (
      <img
        src={contact.photo_url}
        alt=""
        referrerPolicy="no-referrer"
        className={cn(box, "shrink-0 rounded-full object-cover")}
      />
    );
  }
  const h = hue(contact.display_name);
  return (
    <span
      aria-hidden
      className={cn(
        box,
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
      )}
      style={{
        backgroundColor: `oklch(0.42 0.06 ${h})`,
        color: `oklch(0.92 0.04 ${h})`,
      }}
    >
      {initials(contact.display_name)}
    </span>
  );
}

function MethodRows({
  methods,
  href,
}: {
  methods: ContactMethodSchema[];
  href: (value: string) => string;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {methods.map((m) => (
        <li key={`${m.label}-${m.value}`} className="flex items-baseline gap-2">
          <a
            href={href(m.value)}
            target={href(m.value).startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            className="min-w-0 break-words text-13 text-white/85 hover:text-primary-300 hover:underline"
          >
            {m.value}
          </a>
          {m.label && (
            <span className="shrink-0 text-11 text-white/35">{m.label}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ContactDetail({
  contact,
  source,
  onEdit,
  onAllowEditing,
  keepUp,
}: {
  contact: ContactSchema;
  source?: ContactSourceSchema;
  onEdit: () => void;
  onAllowEditing: () => void;
  keepUp: React.ReactNode;
}) {
  const subtitle = [contact.job_title, contact.organization]
    .filter(Boolean)
    .join(" at ");
  const birthday = contact.birthday
    ? describeBirthday(contact.birthday, new Date())
    : null;
  const firstPhone = contact.phones[0]?.value;
  const firstEmail = contact.emails[0]?.value;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <Avatar contact={contact} size="lg" />
        <div>
          <h1 className="type-title text-white/95">
            {contact.display_name || "No name"}
          </h1>
          {contact.nickname && (
            <p className="text-13 text-white/50">"{contact.nickname}"</p>
          )}
          {subtitle && <p className="text-13 text-white/55">{subtitle}</p>}
        </div>
        {(firstPhone || firstEmail) && (
          <div className="flex gap-2">
            {firstPhone && (
              <a
                href={telUrl(firstPhone)}
                className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.06] px-3.5 text-12 font-medium text-white/80 ring-1 ring-white/10 hover:bg-white/[0.1]"
              >
                <Phone className="size-3.5" />
                Call
              </a>
            )}
            {firstEmail && (
              <a
                href={`mailto:${firstEmail}`}
                className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.06] px-3.5 text-12 font-medium text-white/80 ring-1 ring-white/10 hover:bg-white/[0.1]"
              >
                <Mail className="size-3.5" />
                Email
              </a>
            )}
          </div>
        )}
      </header>

      <div className="flex flex-col gap-5 rounded-2xl bg-white/[0.03] px-5 py-5 ring-1 ring-white/[0.06]">
        {contact.phones.length > 0 && (
          <Section icon={Phone} title="Phone">
            <MethodRows methods={contact.phones} href={telUrl} />
          </Section>
        )}
        {contact.emails.length > 0 && (
          <Section icon={Mail} title="Email">
            <MethodRows methods={contact.emails} href={(v) => `mailto:${v}`} />
          </Section>
        )}
        {contact.addresses.length > 0 && (
          <Section icon={MapPin} title="Address">
            <MethodRows methods={contact.addresses} href={mapsUrl} />
          </Section>
        )}
        {birthday && (
          <Section icon={Cake} title="Birthday">
            <p className="text-13 text-white/85">{birthday.date}</p>
            <p className="text-11 text-white/40">{birthday.next}</p>
          </Section>
        )}
        {contact.urls.length > 0 && (
          <Section icon={Globe} title="Links">
            <MethodRows
              methods={contact.urls}
              href={(v) => (/^https?:/.test(v) ? v : `https://${v}`)}
            />
          </Section>
        )}
        {contact.notes && (
          <Section icon={StickyNote} title="Notes">
            <p className="whitespace-pre-wrap text-13 text-white/75">
              {contact.notes}
            </p>
          </Section>
        )}
        {!contact.phones.length &&
          !contact.emails.length &&
          !contact.addresses.length &&
          !birthday &&
          !contact.notes && (
            <p className="text-center text-12 text-white/40">
              Nothing more saved for this person.
            </p>
          )}
      </div>

      {keepUp}

      <footer className="flex flex-col items-center gap-2 text-11 text-white/35">
        {source?.can_edit ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.06] px-3.5 text-12 font-medium text-white/80 ring-1 ring-white/10 hover:bg-white/[0.1]"
          >
            <Pencil className="size-3.5" />
            Edit
          </button>
        ) : (
          source && (
            <button
              type="button"
              onClick={onAllowEditing}
              className="flex h-8 items-center gap-1.5 rounded-full px-3.5 text-12 font-medium text-primary-300 ring-1 ring-primary-400/30 hover:bg-primary-500/10"
            >
              <Pencil className="size-3.5" />
              Allow editing from Bessel
            </button>
          )
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {source && <span>From {source.email}</span>}
          {contact.external_url && (
            <a
              href={contact.external_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-white/70"
            >
              Open in Google Contacts
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}

export function ContactsPage() {
  const {
    contacts,
    isLoading,
    sources,
    syncNow,
    syncing,
    saving,
    updateContact,
    createContact,
    deleteContact,
    allowEditing,
    keepUp,
  } = useContacts();
  const today = useLocalDay();
  const catchUpTask = useCatchUpTask();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "new">("view");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const knownTags = useMemo(
    () =>
      [...new Set(contacts.flatMap((c) => c.tags))].sort((a, b) =>
        a.localeCompare(b, "sv", { sensitivity: "base" }),
      ),
    [contacts],
  );
  const dueCount = contacts.filter((c) => isCatchUpDue(c, today)).length;
  // A filter whose chip is gone (the last tag removed, everyone caught up) shows everyone.
  const active: Filter =
    (filter.kind === "tag" && !knownTags.includes(filter.tag)) ||
    (filter.kind === "due" && dueCount === 0)
      ? { kind: "all" }
      : filter;
  const filtered = useMemo(
    () =>
      contacts.filter(
        (c) =>
          matchesContact(c, search) &&
          (active.kind === "all" ||
            (active.kind === "due" && isCatchUpDue(c, today)) ||
            (active.kind === "tag" && c.tags.includes(active.tag))),
      ),
    [contacts, search, active, today],
  );
  const groups = useMemo(() => groupByLetter(filtered), [filtered]);
  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const sourceOf = (id: string) => sources.find((s) => s.id === id);
  const editable = sources.find((s) => s.can_edit);
  const open = (id: string | null) => {
    setSelectedId(id);
    setMode("view");
  };
  const lastSynced = sources
    .map((s) => s.synced_at)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const error = sources.find((s) => s.sync_error)?.sync_error;

  return (
    <div className="@container -m-4 flex min-h-0 flex-1">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.015] @2xl:w-72">
        <div className="flex shrink-0 items-center gap-1.5 p-2.5 pb-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-white/30" />
            <input
              type="search"
              placeholder="Search name, number, email…"
              aria-label="Search contacts"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-full bg-white/[0.05] pr-3 pl-8 text-12 text-white/85 ring-1 ring-white/[0.06] outline-none transition-[box-shadow,background-color] placeholder:text-white/30 focus:bg-white/[0.07] focus:ring-primary-400/40"
            />
          </div>
          <IconButton
            title="Sync now"
            aria-label="Sync now"
            onClick={syncNow}
            disabled={syncing}
          >
            <RefreshCw className={cn(syncing && "animate-spin")} />
          </IconButton>
          {editable && (
            <button
              type="button"
              title="New contact"
              aria-label="New contact"
              onClick={() => {
                setSelectedId(null);
                setMode("new");
              }}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition-[background-color,transform] duration-150 hover:bg-primary-400 active:scale-95"
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
        <p className="shrink-0 px-3.5 pb-2 text-11 text-white/35">
          {error ??
            (lastSynced
              ? `${contacts.length} contacts - synced ${formatDistanceToNow(lastSynced, { addSuffix: true })}`
              : sources.length
                ? "Fetching your contacts…"
                : "")}
        </p>

        {(knownTags.length > 0 || dueCount > 0) && (
          <fieldset
            aria-label="Filter contacts"
            className="flex shrink-0 flex-wrap gap-1 px-2.5 pb-2"
          >
            {[
              { filter: { kind: "all" } as Filter, label: "All" },
              ...(dueCount
                ? [
                    {
                      filter: { kind: "due" } as Filter,
                      label: `Catch up (${dueCount})`,
                    },
                  ]
                : []),
              ...knownTags.map((tag) => ({
                filter: { kind: "tag", tag } as Filter,
                label: tag,
              })),
            ].map((chip) => {
              const pressed =
                chip.filter.kind === active.kind &&
                (chip.filter.kind !== "tag" ||
                  (active.kind === "tag" && chip.filter.tag === active.tag));
              return (
                <button
                  key={chip.label}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setFilter(chip.filter)}
                  className={cn(
                    "h-6 rounded-full px-2.5 text-11 font-medium ring-1 transition-colors duration-150",
                    pressed
                      ? "bg-white/[0.1] text-white/90 ring-white/15"
                      : "text-white/50 ring-white/[0.06] hover:bg-white/[0.05] hover:text-white/80",
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </fieldset>
        )}

        <div className="flex-1 overflow-y-auto px-1.5 pb-2">
          {groups.map(({ letter, contacts: people }) => (
            <div key={letter}>
              <h4 className="px-2.5 pt-2.5 pb-1 text-11 font-semibold text-white/35">
                {letter}
              </h4>
              {people.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => open(c.id)}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors duration-150",
                    c.id === selectedId
                      ? "bg-white/[0.08] text-white/90"
                      : "text-white/70 hover:bg-white/[0.05] hover:text-white/90",
                  )}
                >
                  <Avatar contact={c} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-13">
                      {c.display_name || "No name"}
                    </span>
                    {(c.organization || c.phones[0]) && (
                      <span className="truncate text-11 text-white/35">
                        {c.organization ?? c.phones[0]?.value}
                      </span>
                    )}
                  </span>
                  {isCatchUpDue(c, today) && (
                    <span
                      title="Time to catch up"
                      className="size-1.5 shrink-0 rounded-full bg-primary-400"
                    />
                  )}
                </button>
              ))}
            </div>
          ))}
          {!isLoading && filtered.length === 0 && (
            <p className="px-2 py-6 text-center text-12 text-white/40">
              {contacts.length ? "No matches" : "No contacts yet"}
            </p>
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        {mode === "new" && editable ? (
          <ContactEditor
            key="new"
            contact={null}
            saving={saving}
            onCancel={() => setMode("view")}
            onSave={(changes) =>
              void createContact(editable.id, changes).then(
                (created) => open(created.id),
                () => {},
              )
            }
          />
        ) : selected && mode === "edit" ? (
          <ContactEditor
            key={selected.id}
            contact={selected}
            saving={saving}
            onCancel={() => setMode("view")}
            onSave={(changes) =>
              void updateContact(selected.id, changes).then(
                () => setMode("view"),
                () => {},
              )
            }
            onDelete={() => setConfirmDelete(true)}
          />
        ) : selected ? (
          <ContactDetail
            contact={selected}
            source={sourceOf(selected.source_id)}
            onEdit={() => setMode("edit")}
            onAllowEditing={() => allowEditing(selected.source_id)}
            keepUp={
              <KeepUpPanel
                contact={selected}
                today={today}
                knownTags={knownTags}
                onChange={(body) => keepUp(selected.id, body)}
                taskMade={catchUpTask.hasTask(selected.display_name)}
                onMakeTask={() => catchUpTask.makeTask(selected.display_name)}
              />
            }
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Users className="size-8 text-white/25" />
            {sources.length === 0 && !isLoading ? (
              <>
                <p className="text-13 font-medium text-white/80">
                  No address book connected
                </p>
                <p className="max-w-xs text-12 text-white/45">
                  Connect your Google account under Calendar and its contacts
                  show up here, kept in sync.
                </p>
              </>
            ) : (
              <p className="text-12 text-white/45">
                Pick someone to see how to reach them.
              </p>
            )}
          </div>
        )}
      </section>

      <ConfirmDeleteDialog
        open={confirmDelete && !!selected}
        onOpenChange={setConfirmDelete}
        title="Delete this contact?"
        description={
          <>
            {selected?.display_name || "This contact"} is deleted from Google
            Contacts too, and so from your phone.
          </>
        }
        onConfirm={() => {
          if (!selected) return;
          void deleteContact(selected.id).then(
            () => {
              setConfirmDelete(false);
              open(null);
            },
            () => setConfirmDelete(false),
          );
        }}
      />
    </div>
  );
}

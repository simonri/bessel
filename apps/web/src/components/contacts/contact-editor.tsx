import type {
  ContactMethodInput,
  ContactMethodSchema,
  ContactSchema,
  ContactUpdate,
} from "@bessel/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { Plus, Trash2, X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { AddressInput } from "./address-input";

type MethodField = "phones" | "emails" | "addresses" | "urls";

export interface ContactDraft {
  name_prefix: string;
  given_name: string;
  middle_name: string;
  family_name: string;
  name_suffix: string;
  nickname: string;
  organization: string;
  job_title: string;
  birthday_day: string;
  birthday_month: string;
  birthday_year: string;
  notes: string;
  phones: ContactMethodInput[];
  emails: ContactMethodInput[];
  addresses: ContactMethodInput[];
  urls: ContactMethodInput[];
}

// The labels Google and the phone know by name; anything else is a custom label.
export const LABELS: Record<MethodField, string[]> = {
  phones: ["Mobile", "Home", "Work", "Main", "Work mobile", "Other"],
  emails: ["Home", "Work", "Other"],
  addresses: ["Home", "Work", "Other"],
  urls: ["Website", "Profile", "Other"],
};

export function draftFrom(contact: ContactSchema | null): ContactDraft {
  // Shown as displayed, so numbers come spaced; the API saves them without.
  const methods = (items: ContactMethodSchema[] | undefined) =>
    (items ?? []).map((m) => ({ label: m.label, value: m.display }));
  const parts = contact && [
    contact.name_prefix,
    contact.given_name,
    contact.middle_name,
    contact.family_name,
    contact.name_suffix,
  ];
  return {
    name_prefix: contact?.name_prefix ?? "",
    // A contact saved with just a display name edits it as the first name.
    given_name:
      contact?.given_name ??
      (parts && parts.every((p) => !p) ? contact.display_name : ""),
    middle_name: contact?.middle_name ?? "",
    family_name: contact?.family_name ?? "",
    name_suffix: contact?.name_suffix ?? "",
    nickname: contact?.nickname ?? "",
    organization: contact?.organization ?? "",
    job_title: contact?.job_title ?? "",
    birthday_day: contact?.birthday ? String(contact.birthday.day) : "",
    birthday_month: contact?.birthday ? String(contact.birthday.month) : "",
    birthday_year: contact?.birthday?.year ? String(contact.birthday.year) : "",
    notes: contact?.notes ?? "",
    phones: methods(contact?.phones),
    emails: methods(contact?.emails),
    addresses: methods(contact?.addresses),
    urls: methods(contact?.urls),
  };
}

const text = (value: string) => value.trim() || null;

function birthdayOf(
  draft: ContactDraft,
): ContactUpdate["birthday"] | "invalid" {
  const [day, month, year] = [
    draft.birthday_day,
    draft.birthday_month,
    draft.birthday_year,
  ].map((v) => v.trim());
  if (!day && !month && !year) return null;
  const [d, m, y] = [Number(day), Number(month), year ? Number(year) : null];
  if (
    !Number.isInteger(d) ||
    !Number.isInteger(m) ||
    d < 1 ||
    d > 31 ||
    m < 1 ||
    m > 12
  )
    return "invalid";
  if (y !== null && (!Number.isInteger(y) || y < 1900 || y > 2100))
    return "invalid";
  return { day: d, month: m, year: y };
}

const cleanMethods = (items: ContactMethodInput[]) =>
  items
    .map((m) => ({
      label: text(m.label ?? ""),
      value: m.value.trim(),
      // A picked address: its parts go too, and make it a change even when the text is the same.
      ...(m.address ? { address: m.address } : {}),
    }))
    .filter((m) => m.value);

/** Only what changed from `before` (everything set, for a new contact), or an error to show. */
export function changesFrom(
  before: ContactDraft,
  after: ContactDraft,
): ContactUpdate | string {
  const birthday = birthdayOf(after);
  if (birthday === "invalid")
    return "That birthday isn't a date. Use day and month, and a year if you know it.";
  const changes: ContactUpdate = {};
  for (const key of [
    "name_prefix",
    "given_name",
    "middle_name",
    "family_name",
    "name_suffix",
    "nickname",
    "organization",
    "job_title",
    "notes",
  ] as const) {
    if (text(after[key]) !== text(before[key])) changes[key] = text(after[key]);
  }
  if (JSON.stringify(birthday) !== JSON.stringify(birthdayOf(before)))
    changes.birthday = birthday;
  for (const key of ["phones", "emails", "addresses", "urls"] as const) {
    const [was, now] = [cleanMethods(before[key]), cleanMethods(after[key])];
    if (JSON.stringify(was) !== JSON.stringify(now)) changes[key] = now;
  }
  return changes;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-11 text-white/45">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

const CUSTOM = "__custom";

/** Where `label` sits among `options`, ignoring case, so Google's "Work Mobile" is "Work mobile". */
export function knownLabel(
  options: string[],
  label: string | null | undefined,
) {
  const wanted = (label ?? "").trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === wanted);
}

function LabelPicker({
  field,
  label,
  ariaLabel,
  onChange,
}: {
  field: MethodField;
  label: string | null | undefined;
  ariaLabel: string;
  onChange: (label: string) => void;
}) {
  const options = LABELS[field];
  const known = knownLabel(options, label);
  const [typing, setTyping] = useState(false);
  if (typing) {
    return (
      <input
        aria-label={ariaLabel}
        // biome-ignore lint/a11y/noAutofocus: opened by picking "Custom", so typing is the next step
        autoFocus
        placeholder="Label"
        value={label ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTyping(false)}
        className={cn(INPUT, "w-28 shrink-0")}
      />
    );
  }
  const custom = label && !known ? label : null;
  return (
    <Select
      value={known ?? custom ?? ""}
      onValueChange={(value) => {
        if (value === CUSTOM) {
          setTyping(true);
          onChange(custom ?? "");
        } else onChange(value);
      }}
    >
      <SelectTrigger size="sm" aria-label={ariaLabel} className="w-28 shrink-0">
        <SelectValue placeholder="Label" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
        {custom && <SelectItem value={custom}>{custom}</SelectItem>}
        <SelectItem value={CUSTOM}>Custom…</SelectItem>
      </SelectContent>
    </Select>
  );
}

const INPUT =
  "h-8 w-full min-w-0 rounded-lg bg-white/[0.05] px-2.5 text-13 text-white/85 ring-1 ring-white/[0.06] outline-none placeholder:text-white/25 focus:bg-white/[0.07] focus:ring-primary-400/40";

function Methods({
  field,
  title,
  addLabel,
  placeholder,
  items,
  onChange,
}: {
  field: MethodField;
  title: string;
  addLabel: string;
  placeholder: string;
  items: ContactMethodInput[];
  onChange: (items: ContactMethodInput[]) => void;
}) {
  const set = (index: number, patch: Partial<ContactMethodInput>) =>
    onChange(items.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-11 text-white/45">{title}</legend>
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no ids; their order is the order saved
        <div key={i} className="flex items-center gap-1.5">
          <LabelPicker
            field={field}
            label={item.label}
            ariaLabel={`${title} ${i + 1} label`}
            onChange={(label) => set(i, { label })}
          />
          {field === "addresses" ? (
            <AddressInput
              ariaLabel={`${title} ${i + 1}`}
              placeholder={placeholder}
              value={item.value}
              onChange={(value, address) => set(i, { value, address })}
              className={INPUT}
            />
          ) : (
            <input
              aria-label={`${title} ${i + 1}`}
              placeholder={placeholder}
              value={item.value}
              onChange={(e) => set(i, { value: e.target.value })}
              className={INPUT}
            />
          )}
          <button
            type="button"
            aria-label={`Remove ${title.toLowerCase()} ${i + 1}`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/35 hover:bg-white/[0.06] hover:text-white/75"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...items, { label: LABELS[field][0], value: "" }])
        }
        className="flex h-7 w-fit items-center gap-1 rounded-md px-1.5 text-12 text-white/50 hover:bg-white/[0.05] hover:text-white/80"
      >
        <Plus className="size-3.5" />
        {addLabel}
      </button>
    </fieldset>
  );
}

/** The contact as a form; saving sends only what changed. */
export function ContactEditor({
  contact,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  contact: ContactSchema | null;
  saving: boolean;
  onSave: (changes: ContactUpdate) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [before] = useState(() => draftFrom(contact));
  const [draft, setDraft] = useState(before);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const input = (key: keyof ContactDraft, label: string, placeholder = "") => (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          value={draft[key] as string}
          placeholder={placeholder}
          onChange={(e) => set(key, e.target.value as never)}
          className={INPUT}
        />
      )}
    </Field>
  );

  const save = () => {
    const changes = changesFrom(contact ? before : draftFrom(null), draft);
    if (typeof changes === "string") return setError(changes);
    if (Object.keys(changes).length === 0) return onCancel();
    setError(null);
    onSave(changes);
  };

  return (
    <form
      className="mx-auto flex max-w-xl flex-col gap-5 px-6 py-8"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h1 className="type-title text-white/95">
        {contact ? "Edit contact" : "New contact"}
      </h1>
      <div className="grid grid-cols-2 gap-3">
        {input("given_name", "First name")}
        {input("middle_name", "Middle name")}
        {input("family_name", "Last name")}
        {input("nickname", "Nickname")}
        {input("name_prefix", "Prefix")}
        {input("name_suffix", "Suffix")}
        {input("organization", "Company")}
        {input("job_title", "Title")}
      </div>
      <Methods
        field="phones"
        title="Phones"
        addLabel="Add phone"
        placeholder="+46 70 123 45 67"
        items={draft.phones}
        onChange={(v) => set("phones", v)}
      />
      <Methods
        field="emails"
        title="Emails"
        addLabel="Add email"
        placeholder="name@example.com"
        items={draft.emails}
        onChange={(v) => set("emails", v)}
      />
      <Methods
        field="addresses"
        title="Addresses"
        addLabel="Add address"
        placeholder="Storgatan 1, Lund"
        items={draft.addresses}
        onChange={(v) => set("addresses", v)}
      />
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-11 text-white/45">Birthday</legend>
        <div className="flex gap-1.5">
          <input
            aria-label="Birthday day"
            placeholder="Day"
            inputMode="numeric"
            value={draft.birthday_day}
            onChange={(e) => set("birthday_day", e.target.value)}
            className={cn(INPUT, "w-16")}
          />
          <input
            aria-label="Birthday month"
            placeholder="Month"
            inputMode="numeric"
            value={draft.birthday_month}
            onChange={(e) => set("birthday_month", e.target.value)}
            className={cn(INPUT, "w-20")}
          />
          <input
            aria-label="Birthday year"
            placeholder="Year (optional)"
            inputMode="numeric"
            value={draft.birthday_year}
            onChange={(e) => set("birthday_year", e.target.value)}
            className={cn(INPUT, "w-32")}
          />
        </div>
      </fieldset>
      <Methods
        field="urls"
        title="Links"
        addLabel="Add link"
        placeholder="example.com"
        items={draft.urls}
        onChange={(v) => set("urls", v)}
      />
      <Field label="Notes">
        {(id) => (
          <textarea
            id={id}
            rows={4}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            className={cn(INPUT, "h-auto resize-y py-2")}
          />
        )}
      </Field>
      {error && <p className="text-12 text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex h-8 items-center rounded-full bg-primary-500 px-4 text-12 font-medium text-white hover:bg-primary-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : contact ? "Save" : "Add contact"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-full px-3 text-12 text-white/60 hover:bg-white/[0.05] hover:text-white/85"
        >
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-full px-3 text-12 text-white/50 hover:bg-white/[0.05] hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        )}
      </div>
      <p className="text-11 text-white/35">
        Saved to Google Contacts, so it shows on your phone too.
      </p>
    </form>
  );
}

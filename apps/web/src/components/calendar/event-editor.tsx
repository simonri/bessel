import type { EditScope } from "@bessel/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { Switch } from "@bessel/ui/components/switch";
import { addDays, format } from "date-fns";
import {
  ArrowRight,
  Clock,
  Globe,
  MapPin,
  Repeat,
  User,
  Video,
  X,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { PrimaryButton, SoftButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { CalendarPicker } from "./calendar-picker";
import { shortOffsetLabel } from "./calendar-timezone";
import type {
  CalendarAccount,
  CalendarEvent,
  CalendarInfo,
} from "./calendar-types";
import {
  DateSelect,
  endTimeOptions,
  fmtDuration,
  httpUrl,
  plainControlClass,
  plainFieldClass,
  Row,
  Section,
  startTimeOptions,
  TimeSelect,
} from "./event-fields";
import {
  describeRecurrence,
  type EventDraftTiming,
  presetFor,
  type RepeatPresetKey,
  repeatPresets,
  toggleAllDay,
  withEnd,
  withStart,
} from "./event-payload";
import { sameTiming } from "./grid-geometry";
import { allowedScopes, ScopeMenuItems } from "./scope-menu";
import type { EventChangesInput } from "./use-event-mutations";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EditorSubject {
  /** Null while creating a new event. */
  event: CalendarEvent | null;
  timing: EventDraftTiming;
  calendarId: string;
}

export interface FormState {
  title: string;
  timing: EventDraftTiming;
  repeat: RepeatPresetKey;
  calendarId: string;
  location: string;
  description: string;
  attendees: string[];
  addConference: boolean;
  busy: boolean;
}

export interface SaveRequest {
  changes: EventChangesInput;
  calendarId: string;
  scope?: EditScope;
  notifyGuests: boolean;
}

export function initialState(subject: EditorSubject): FormState {
  const d = subject.event?.details;
  return {
    title: subject.event?.title ?? "",
    timing: subject.timing,
    repeat: d
      ? presetFor(d.recurrence, d.rule !== null, subject.timing.start)
      : "none",
    calendarId: subject.calendarId,
    location: d?.location ?? "",
    description: d?.description ?? "",
    attendees: d?.attendees.map((a) => a.email) ?? [],
    addConference: false,
    busy: d?.busy ?? true,
  };
}

/** Only what differs from the starting state; a new event sends everything set. */
export function diffForm(
  initial: FormState,
  current: FormState,
  isNew: boolean,
): EventChangesInput {
  const changes: EventChangesInput = {};
  if (isNew || current.title !== initial.title)
    changes.title = current.title.trim();
  if (isNew || !sameTiming(current.timing, initial.timing))
    changes.timing = current.timing;
  if (current.repeat !== initial.repeat && current.repeat !== "custom") {
    changes.recurrence =
      repeatPresets(current.timing.start).find((p) => p.key === current.repeat)
        ?.recurrence ?? null;
  }
  if (current.location !== initial.location)
    changes.location = current.location.trim() || null;
  if (current.description !== initial.description)
    changes.description = current.description || null;
  if (current.attendees.join() !== initial.attendees.join())
    changes.attendees = current.attendees;
  if (current.addConference) changes.addConference = true;
  if (current.busy !== initial.busy) changes.busy = current.busy;
  return changes;
}

const plainSelectClass = cn(
  plainControlClass,
  "w-auto gap-1.5 border-0 bg-transparent shadow-none dark:bg-transparent dark:hover:bg-white/[0.06] [&>svg]:opacity-40",
);

function onDay(day: Date, time: Date): Date {
  const next = new Date(time);
  next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return next;
}

export function cityOf(timeZone: string): string {
  return (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
}

function TimingFields({
  timing,
  onChange,
}: {
  timing: EventDraftTiming;
  onChange: (timing: EventDraftTiming) => void;
}) {
  if (timing.allDay) {
    // All-day ends are exclusive; show and edit the last day instead.
    const lastDay = addDays(timing.end, -1);
    const days = Math.round(
      (timing.end.getTime() - timing.start.getTime()) / 86_400_000,
    );
    return (
      <>
        <DateSelect
          label="Start date"
          value={timing.start}
          onChange={(day) => onChange(withStart(timing, day))}
        />
        <ArrowRight className="mx-1 size-3.5 text-white/30" />
        <DateSelect
          label="End date"
          value={lastDay}
          onChange={(day) => onChange(withEnd(timing, addDays(day, 1)))}
        />
        <span className="ml-1 text-12 text-white/40">
          {days === 1 ? "1 day" : `${days} days`}
        </span>
      </>
    );
  }
  const multiDay =
    format(timing.start, "yyyy-MM-dd") !== format(timing.end, "yyyy-MM-dd");
  return (
    <>
      <TimeSelect
        label="Start time"
        value={timing.start}
        options={startTimeOptions(timing.start)}
        onChange={(start) => onChange(withStart(timing, start))}
      />
      <ArrowRight className="mx-1 size-3.5 text-white/30" />
      <TimeSelect
        label="End time"
        value={timing.end}
        options={endTimeOptions(timing.start, timing.end)}
        onChange={(end) => onChange(withEnd(timing, end))}
      />
      <span className="ml-1 text-12 text-white/40">
        {fmtDuration(timing.end.getTime() - timing.start.getTime())}
      </span>
      <div className="flex w-full items-center">
        <DateSelect
          label="Date"
          value={timing.start}
          onChange={(day) =>
            onChange(withStart(timing, onDay(day, timing.start)))
          }
        />
        {multiDay && (
          <>
            <ArrowRight className="mx-1 size-3.5 text-white/30" />
            <DateSelect
              label="End date"
              value={timing.end}
              onChange={(day) =>
                onChange(withEnd(timing, onDay(day, timing.end)))
              }
            />
          </>
        )}
      </div>
    </>
  );
}

function GuestField({
  attendees,
  onChange,
}: {
  attendees: string[];
  onChange: (attendees: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const invalid = draft.trim() !== "" && !EMAIL.test(draft.trim());
  const add = () => {
    const email = draft.trim().toLowerCase();
    if (!EMAIL.test(email)) return;
    if (!attendees.includes(email)) onChange([...attendees, email]);
    setDraft("");
  };
  return (
    <>
      {attendees.map((email) => (
        <div
          key={email}
          className="group flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-white/80 hover:bg-white/[0.04]"
        >
          <span className="min-w-0 flex-1 truncate">{email}</span>
          <button
            type="button"
            aria-label={`Remove ${email}`}
            onClick={() => onChange(attendees.filter((a) => a !== email))}
            className="rounded p-0.5 text-white/40 opacity-0 group-hover:opacity-100 hover:bg-white/[0.08] hover:text-white/80 focus-visible:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <input
        className={cn(plainFieldClass, invalid && "text-red-300")}
        placeholder="Add participant"
        aria-label="Add participant"
        value={draft}
        aria-invalid={invalid}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && attendees.length) {
            onChange(attendees.slice(0, -1));
          }
        }}
      />
    </>
  );
}

export function EventEditor({
  subject,
  calendars,
  accounts,
  timeZone,
  saving,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  subject: EditorSubject;
  /** Calendars the event may be saved to. */
  calendars: CalendarInfo[];
  accounts: CalendarAccount[];
  /** The zone times are shown and saved in. */
  timeZone: string;
  saving: boolean;
  onSave: (request: SaveRequest) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const isNew = subject.event === null;
  const [initial] = useState(() => initialState(subject));
  const [form, setForm] = useState(initial);
  const [notifyGuests, setNotifyGuests] = useState(true);
  const titleRef = useRef<HTMLInputElement>(null);

  const calendar = calendars.find((c) => c.id === form.calendarId);
  const account = accounts.find((a) => a.id === calendar?.accountId);
  const isGoogle = account?.provider === "google";
  const recurring = subject.event?.details.recurring ?? false;
  const changes = diffForm(initial, form, isNew);
  // Edited since opening (a fresh draft only counts once something is typed).
  const touched =
    Object.keys(diffForm(initial, form, false)).length > 0 ||
    form.calendarId !== initial.calendarId;
  const dirty = isNew || touched;
  const presets = repeatPresets(form.timing.start);
  const hasGuests = form.attendees.length > 0;
  const details = subject.event?.details;
  const conferenceUrl = httpUrl(details?.conferenceUrl);

  useEffect(() => {
    onDirtyChange(touched);
  }, [touched, onDirtyChange]);

  useEffect(() => {
    if (isNew) titleRef.current?.focus();
  }, [isNew]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const request = (scope?: EditScope): SaveRequest => ({
    changes,
    calendarId: form.calendarId,
    scope,
    notifyGuests: hasGuests && notifyGuests,
  });
  const movesCalendar = !isNew && form.calendarId !== initial.calendarId;
  const scopes = allowedScopes({
    changesRule: "recurrence" in changes,
    movesCalendar,
  });

  const save = () => {
    if (!dirty || saving) return;
    if (recurring) return; // The scope menu handles saving repeating events.
    onSave(request());
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!recurring) save();
    }
  };

  // Calendars in other accounts can't receive an existing event.
  const calendarChoices = isNew
    ? calendars
    : calendars.filter((c) => c.accountId === calendar?.accountId);

  return (
    <div className="flex flex-col" onKeyDown={onKeyDown}>
      <div className="px-4 pb-3">
        <input
          ref={titleRef}
          className="w-full bg-transparent text-15 font-medium text-white/90 outline-none placeholder:text-white/30"
          placeholder={isNew ? "New event" : "Untitled"}
          aria-label="Title"
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              save();
            }
          }}
        />
      </div>

      <Section>
        <Row icon={<Clock />}>
          <TimingFields
            timing={form.timing}
            onChange={(t) => update("timing", t)}
          />
        </Row>
        <Row
          icon={
            <Switch
              size="sm"
              aria-label="All-day"
              checked={form.timing.allDay}
              onCheckedChange={() =>
                update("timing", toggleAllDay(form.timing))
              }
            />
          }
        >
          <span className="px-1.5 text-white/85">All-day</span>
        </Row>
        {!form.timing.allDay && (
          <Row icon={<Globe />}>
            <span className="px-1.5">
              <span className="text-white/40">
                {shortOffsetLabel(timeZone, form.timing.start)}
              </span>{" "}
              <span className="text-white/85">{cityOf(timeZone)}</span>
            </span>
          </Row>
        )}
        <Row icon={<Repeat />}>
          <Select
            value={form.repeat}
            onValueChange={(v) => update("repeat", v as RepeatPresetKey)}
          >
            <SelectTrigger aria-label="Repeat" className={plainSelectClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {initial.repeat === "custom" && (
                <SelectItem value="custom">
                  {describeRecurrence(
                    details?.recurrence ?? null,
                    form.timing.start,
                  )}
                </SelectItem>
              )}
              {presets.map((preset) => (
                <SelectItem key={preset.key} value={preset.key}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section>
        <Row icon={<User />}>
          {details?.creatorEmail && (
            <p className="w-full truncate px-1.5 leading-7 text-white/85">
              Created by{" "}
              <span className="text-white/45" title={details.creatorEmail}>
                {details.creatorName ?? details.creatorEmail}
              </span>
            </p>
          )}
          {isGoogle ? (
            <GuestField
              attendees={form.attendees}
              onChange={(a) => update("attendees", a)}
            />
          ) : (
            <p className="px-1.5 leading-7 text-white/35">
              {hasGuests
                ? `${form.attendees.length} participants - edit them in Apple Calendar`
                : "Participants aren't supported for iCloud"}
            </p>
          )}
        </Row>
      </Section>

      <Section>
        <Row icon={<Video />}>
          {conferenceUrl ? (
            <a
              href={conferenceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(plainControlClass, "text-sky-300/90")}
            >
              Join video call
            </a>
          ) : isGoogle ? (
            <button
              type="button"
              aria-pressed={form.addConference}
              onClick={() => update("addConference", !form.addConference)}
              className={cn(
                plainControlClass,
                !form.addConference && "text-white/35",
              )}
            >
              {form.addConference
                ? "Google Meet - added on save"
                : "Add Google Meet"}
            </button>
          ) : (
            <span className="px-1.5 text-white/35">Conferencing</span>
          )}
        </Row>
        <Row icon={<MapPin />}>
          <input
            className={plainFieldClass}
            placeholder="Location"
            aria-label="Location"
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
          />
        </Row>
      </Section>

      <Section>
        <textarea
          className={cn(
            plainFieldClass,
            "block h-auto max-h-48 min-h-14 resize-none py-1.5 pl-2.5 leading-relaxed",
          )}
          placeholder="Description"
          aria-label="Description"
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </Section>

      <Section>
        <CalendarPicker
          value={form.calendarId}
          calendars={calendarChoices}
          accounts={accounts}
          onChange={(id) => update("calendarId", id)}
        />
        <Row>
          <Select
            value={form.busy ? "busy" : "free"}
            onValueChange={(v) => update("busy", v === "busy")}
          >
            <SelectTrigger aria-label="Show as" className={plainSelectClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="busy">Busy</SelectItem>
              <SelectItem value="free">Free</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>

      {dirty && (
        <div className="sticky bottom-0 flex items-center justify-end gap-1.5 border-t border-white/[0.07] bg-popover px-3 py-2">
          {isGoogle && hasGuests && (
            <label className="mr-auto flex cursor-pointer items-center gap-1.5 text-11 text-white/50">
              <input
                type="checkbox"
                className="accent-primary-500"
                checked={notifyGuests}
                onChange={(e) => setNotifyGuests(e.target.checked)}
              />
              Email guests
            </label>
          )}
          <SoftButton onClick={onCancel}>Cancel</SoftButton>
          {recurring && !isNew ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <PrimaryButton className="h-7" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </PrimaryButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <ScopeMenuItems
                  label="Save changes to"
                  scopes={scopes}
                  onSelect={(scope) => onSave(request(scope))}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <PrimaryButton className="h-7" disabled={saving} onClick={save}>
              {saving ? "Saving…" : isNew ? "Create" : "Save"}
            </PrimaryButton>
          )}
        </div>
      )}
    </div>
  );
}

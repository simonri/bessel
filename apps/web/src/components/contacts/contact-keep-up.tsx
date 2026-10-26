import type { ContactKeepUpUpdate, ContactSchema } from "@bessel/client";
import { Check, Eye, Repeat, Tag, X } from "lucide-react";
import { useId, useState } from "react";
import { apiDate } from "@/lib/local-day";
import { cn } from "@/lib/utils";
import {
  apiDay,
  describeCatchUp,
  describeLastSeen,
  isCatchUpDue,
  KEEP_IN_TOUCH,
} from "./contact-meta";
import { Section } from "./contact-section";

const PILL =
  "flex h-7 items-center gap-1.5 rounded-full px-3 text-12 font-medium ring-1 transition-colors duration-150";

/** Bessel's own layer on a contact: when they were last seen, how often to
 *  catch up, and tags. None of it goes to Google. */
export function KeepUpPanel({
  contact,
  today,
  knownTags,
  onChange,
  taskMade,
  onMakeTask,
}: {
  contact: ContactSchema;
  /** The local day as "yyyy-mm-dd". */
  today: string;
  knownTags: string[];
  onChange: (body: ContactKeepUpUpdate) => void;
  taskMade: boolean;
  onMakeTask: () => void;
}) {
  const [draftTag, setDraftTag] = useState("");
  const listId = useId();
  const caughtUpToday =
    !!contact.caught_up_on && apiDay(contact.caught_up_on) === today;
  const due = isCatchUpDue(contact, today);

  const addTag = () => {
    const tag = draftTag.trim();
    setDraftTag("");
    if (!tag || contact.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
      return;
    onChange({ tags: [...contact.tags, tag] });
  };

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-white/[0.03] px-5 py-5 ring-1 ring-white/[0.06]">
      <Section icon={Eye} title="Last seen">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-13 text-white/85">
            {describeLastSeen(contact.last_seen, today)}
          </p>
          <button
            type="button"
            disabled={caughtUpToday}
            onClick={() => onChange({ caught_up_on: apiDate(today) })}
            className={cn(
              PILL,
              caughtUpToday
                ? "text-white/40 ring-white/[0.06]"
                : "bg-white/[0.06] text-white/80 ring-white/10 hover:bg-white/[0.1]",
            )}
          >
            <Check className="size-3.5" />
            Caught up today
          </button>
        </div>
      </Section>

      <Section icon={Repeat} title="Keep in touch">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <select
            aria-label="Keep in touch"
            value={contact.keep_in_touch_days ?? ""}
            onChange={(e) =>
              onChange({
                keep_in_touch_days: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
            }
            className="h-7 rounded-lg bg-white/[0.05] px-2 text-12 text-white/85 ring-1 ring-white/[0.08] outline-none focus:ring-primary-400/40"
          >
            <option value="">Off</option>
            {KEEP_IN_TOUCH.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
            {contact.keep_in_touch_days &&
              !KEEP_IN_TOUCH.some(
                (o) => o.days === contact.keep_in_touch_days,
              ) && (
                <option value={contact.keep_in_touch_days}>
                  Every {contact.keep_in_touch_days} days
                </option>
              )}
          </select>
          {due && (
            <button
              type="button"
              disabled={taskMade}
              onClick={onMakeTask}
              className={cn(
                PILL,
                taskMade
                  ? "text-white/40 ring-white/[0.06]"
                  : "text-primary-300 ring-primary-400/30 hover:bg-primary-500/10",
              )}
            >
              {taskMade ? "Task added" : "Make a task"}
            </button>
          )}
        </div>
        {contact.catch_up_on && (
          <p
            className={cn(
              "mt-1 text-11",
              due ? "text-primary-300" : "text-white/40",
            )}
          >
            {describeCatchUp(contact.catch_up_on, today)}
          </p>
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
                onClick={() =>
                  onChange({ tags: contact.tags.filter((t) => t !== tag) })
                }
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

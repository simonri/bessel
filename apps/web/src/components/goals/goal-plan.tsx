import type { GoalPlanSchemaInput, TypicalDay } from "@bessel/client";
import {
  getGoalPlanOptions,
  getGoalPlanQueryKey,
  getTypicalDayOptions,
  saveGoalPlanMutation,
} from "@bessel/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PrimaryButton, SectionLabel } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";

const CARD = "rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]";
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const PLAN_FIELDS: {
  key: keyof GoalPlanSchemaInput;
  label: string;
  prompt: string;
}[] = [
  {
    key: "anti_vision",
    label: "The life you refuse",
    prompt:
      "If nothing changes for five years, what does an average Tuesday look like?",
  },
  {
    key: "vision",
    label: "The life you're building",
    prompt: "In three years, what does an average Tuesday look like?",
  },
  {
    key: "identity",
    label: "Who you're becoming",
    prompt: "I am the type of person who ...",
  },
  {
    key: "one_year",
    label: "In a year",
    prompt: "What has to be true in a year to know the old pattern broke?",
  },
  {
    key: "one_month",
    label: "This month",
    prompt: "What will you learn, build or finish this month?",
  },
  {
    key: "rules",
    label: "Rules",
    prompt: "What won't you give up on the way?",
  },
];

/** The typical day in plain lines, leaving out what there's no data for. */
export function typicalDayLines(day: TypicalDay): string[] {
  const lines: string[] = [];
  if (day.wake) lines.push(`Up at ${day.wake}`);
  if (day.computer_from && day.computer_until)
    lines.push(
      `At the computer ${day.computer_from}-${day.computer_until}${day.computer_hours != null ? `, ${day.computer_hours} h` : ""}`,
    );
  lines.push(
    `${day.tasks_completed} tasks done`,
    day.gym_share > 0
      ? `Gym ${Math.round(day.gym_share * 100)}% of them`
      : "No gym",
  );
  if (day.steps != null) lines.push(`${day.steps.toLocaleString()} steps`);
  if (day.asleep) lines.push(`Asleep at ${day.asleep}`);
  return lines;
}

function TypicalDayCard() {
  // Yesterday's weekday: the most recent full day.
  const [weekday, setWeekday] = useState((new Date().getDay() + 5) % 7);
  const { data } = useQuery(
    getTypicalDayOptions({ client, query: { weekday } }),
  );
  return (
    <div className={cn(CARD, "flex flex-col gap-2")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-13 font-medium text-white/80">Your typical</p>
        <select
          aria-label="Weekday"
          className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-12 text-white/80"
          value={weekday}
          onChange={(e) => setWeekday(Number(e.target.value))}
        >
          {WEEKDAYS.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {data && data.days === 0 ? (
        <p className="text-12 text-white/40">
          No data for this weekday yet: sleep comes from Apple Health and
          computer time from the desktop app.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-13 text-white/70">
          {data &&
            typicalDayLines(data).map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {data && data.days > 0 && (
        <p className="text-11 text-white/35">
          From the last {data.weeks} {WEEKDAYS[data.weekday]}s. Is it closer to
          the life you're building or the one you refuse?
        </p>
      )}
    </div>
  );
}

function PlanEditor() {
  const queryClient = useQueryClient();
  const { data } = useQuery(getGoalPlanOptions({ client }));
  const [draft, setDraft] = useState<GoalPlanSchemaInput>({});
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  const save = useMutation({
    ...saveGoalPlanMutation({ client }),
    onSuccess: (saved) => {
      queryClient.setQueryData(getGoalPlanQueryKey({ client }), saved);
      toast.success("Plan saved");
    },
    onError: () => toast.error("Couldn't save the plan"),
  });
  const changed = PLAN_FIELDS.some(
    ({ key }) => (draft[key] ?? "") !== (data?.[key] ?? ""),
  );

  return (
    <form
      className={cn(CARD, "flex flex-col gap-3")}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ body: draft });
      }}
    >
      <p className="text-12 text-white/45">
        Your own words. Assistants read it to hold your days against it; they
        never write it for you.
      </p>
      {PLAN_FIELDS.map(({ key, label, prompt }) => (
        <label key={key} className="flex flex-col gap-1 text-12 text-white/55">
          {label}
          <textarea
            rows={2}
            maxLength={5000}
            placeholder={prompt}
            value={draft[key] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
            className="resize-y rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-13 text-white/85 outline-none placeholder:text-white/25 focus:border-primary-500/50"
          />
        </label>
      ))}
      <PrimaryButton
        type="submit"
        size="sm"
        className="self-end"
        disabled={!changed || save.isPending}
      >
        Save plan
      </PrimaryButton>
    </form>
  );
}

export function GoalPlanSection() {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Plan</SectionLabel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_20rem]">
        <PlanEditor />
        <TypicalDayCard />
      </div>
    </section>
  );
}

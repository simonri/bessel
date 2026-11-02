import type { ReflectionSchema } from "@bessel/client";
import {
  answerReflectionMutation,
  getGoalPlanOptions,
  getGoalPlanQueryKey,
  listReflectionsOptions,
  listReflectionsQueryKey,
  saveGoalPlanMutation,
} from "@bessel/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OPEN_PAGE_EVENT } from "@/components/pages";
import { PrimaryButton, SectionLabel } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { userStorage } from "@/lib/user-storage";
import { cn } from "@/lib/utils";

const CARD = "rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]";
const SHOWN_KEY = "bessel:reflectionsShown";
const POLL_MS = 60_000;

/** "Last 2 hours: chromium 84 min, vesktop 22 min", or null without data. */
export function contextLine(
  context: ReflectionSchema["context"],
): string | null {
  const apps = (context?.apps ?? []) as { app: string; minutes: number }[];
  if (!apps.length) return null;
  return `Last ${context.hours ?? 2} hours: ${apps.map((a) => `${a.app} ${a.minutes} min`).join(", ")}`;
}

function OpenQuestion({ reflection }: { reflection: ReflectionSchema }) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState("");
  const save = useMutation({
    ...answerReflectionMutation({ client }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: listReflectionsQueryKey({ client }),
      }),
    onError: () => toast.error("Couldn't save the answer"),
  });
  const context = contextLine(reflection.context);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (answer.trim())
          save.mutate({
            path: { reflection_id: reflection.id },
            body: { answer },
          });
      }}
    >
      <p className="text-13 text-white/85">{reflection.question}</p>
      <p className="text-11 text-white/40">
        {format(reflection.asked_at, "EEE HH:mm")}
        {context ? ` - ${context}` : ""}
      </p>
      <textarea
        aria-label={reflection.question}
        rows={2}
        maxLength={2000}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        className="resize-y rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-13 text-white/85 outline-none focus:border-primary-500/50"
      />
      <PrimaryButton
        type="submit"
        size="sm"
        className="self-end"
        disabled={!answer.trim() || save.isPending}
      >
        Answer
      </PrimaryButton>
    </form>
  );
}

function QuestionsSetting() {
  const queryClient = useQueryClient();
  const { data: plan } = useQuery(getGoalPlanOptions({ client }));
  const save = useMutation({
    ...saveGoalPlanMutation({ client }),
    onSuccess: (saved) =>
      queryClient.setQueryData(getGoalPlanQueryKey({ client }), saved),
    onError: () => toast.error("Couldn't change it"),
  });
  return (
    <select
      aria-label="Questions per day"
      className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-12 text-white/80"
      value={plan?.questions_per_day ?? 0}
      disabled={!plan || save.isPending}
      onChange={(e) => {
        if (!plan) return;
        const perDay = Number(e.target.value);
        // They come as system notifications while Bessel is open.
        if (
          perDay > 0 &&
          typeof Notification !== "undefined" &&
          Notification.permission === "default"
        )
          void Notification.requestPermission();
        save.mutate({ body: { ...plan, questions_per_day: perDay } });
      }}
    >
      <option value={0}>Off</option>
      {[1, 2, 3, 4].map((n) => (
        <option key={n} value={n}>
          {n} a day
        </option>
      ))}
    </select>
  );
}

export function ReflectionsSection() {
  const { data = [] } = useQuery(
    listReflectionsOptions({ client, query: { limit: 20 } }),
  );
  const open = data.filter((r) => r.answer == null);
  const answered = data.filter((r) => r.answer != null).slice(0, 5);
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel action={<QuestionsSetting />}>
        Questions during the day
      </SectionLabel>
      <div className={cn(CARD, "flex flex-col gap-4")}>
        {data.length === 0 && (
          <p className="text-12 text-white/45">
            Bessel asks at random moments, with what you were doing just before,
            to catch the autopilot. Turn it on with how many a day.
          </p>
        )}
        {open.map((r) => (
          <OpenQuestion key={r.id} reflection={r} />
        ))}
        {answered.map((r) => (
          <div key={r.id} className="flex flex-col gap-0.5">
            <p className="text-12 text-white/50">{r.question}</p>
            <p className="text-13 text-white/80">{r.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function readShown(): Set<string> {
  try {
    return new Set(JSON.parse(userStorage.getItem(SHOWN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

/** A system notification once for each new question, while the app is open; a click opens Goals. */
export function QuestionAlerts() {
  const { data } = useQuery({
    ...listReflectionsOptions({
      client,
      query: { unanswered: true, limit: 5 },
    }),
    refetchInterval: POLL_MS,
  });
  useEffect(() => {
    if (!data?.length || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const shown = readShown();
    for (const reflection of data) {
      if (shown.has(reflection.id)) continue;
      shown.add(reflection.id);
      const notification = new Notification(reflection.question, {
        body: contextLine(reflection.context) ?? undefined,
        tag: `reflection-${reflection.id}`,
      });
      notification.onclick = () => {
        window.focus();
        window.dispatchEvent(
          new CustomEvent(OPEN_PAGE_EVENT, { detail: "goals" }),
        );
        notification.close();
      };
    }
    userStorage.setItem(SHOWN_KEY, JSON.stringify([...shown].slice(-100)));
  }, [data]);
  return null;
}

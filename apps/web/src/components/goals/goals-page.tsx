import type { GoalScore } from "@bessel/client";
import {
  checkInGoalMutation,
  createGoalMutation,
  deleteGoalMutation,
  goalScoreboardOptions,
  goalScoreboardQueryKey,
  listGoalsQueryKey,
} from "@bessel/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Lock, Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import {
  EmptyState,
  IconButton,
  PageHeader,
  PrimaryButton,
  SoftButton,
  TextInput,
} from "@/components/ui-kit";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";
import { dayParam } from "@/routes/_app/-google-timeline-utils";
import { GoalPlanSection } from "./goal-plan";
import {
  EMPTY_DRAFT,
  type GoalDraft,
  isLevel,
  METRICS,
  progressLine,
  stepLine,
  toGoalCreate,
} from "./goal-utils";
import { ReflectionsSection } from "./reflections";

const CARD = "rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]";
const FIELD = "flex flex-col gap-1 text-12 text-white/50";
const SELECT =
  "h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-13 text-white/85 outline-none";

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: goalScoreboardQueryKey({ client }),
    });
    void queryClient.invalidateQueries({
      queryKey: listGoalsQueryKey({ client }),
    });
  };
}

function History({ score }: { score: GoalScore }) {
  return (
    <div
      role="img"
      className="flex items-center gap-1"
      aria-label="Earlier periods: filled when the target was met"
    >
      {score.history.map((period) => (
        <span
          key={String(period.start)}
          title={`${format(period.start, "MMM d")}: ${period.value}`}
          className={cn(
            "size-2.5 rounded-full",
            period.met ? "bg-emerald-400/80" : "bg-white/[0.12]",
          )}
        />
      ))}
      <span
        title="So far"
        className={cn(
          "size-2.5 rounded-full ring-1",
          score.current.met
            ? "bg-emerald-400/40 ring-emerald-400/60"
            : "ring-white/30",
        )}
      />
    </div>
  );
}

function GoalCard({ score }: { score: GoalScore }) {
  const refresh = useRefresh();
  const [confirming, setConfirming] = useState(false);
  const { goal } = score;
  const checkIn = useMutation({
    ...checkInGoalMutation({ client }),
    onSuccess: refresh,
    onError: () => toast.error("Couldn't check in"),
  });
  const remove = useMutation({
    ...deleteGoalMutation({ client }),
    onSuccess: refresh,
    onError: () => toast.error("Couldn't remove the goal"),
  });
  const step = stepLine(score);

  return (
    <div className={cn(CARD, "flex flex-col gap-3")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-14 font-medium text-white/90">
            {goal.sensitivity === "private" && (
              <Lock className="size-3 shrink-0 text-white/40" />
            )}
            {goal.title}
          </p>
          <p className="text-13 text-white/60">
            {score.measured ? progressLine(score) : "No data for this yet"}
          </p>
        </div>
        <IconButton
          destructive
          aria-label={`Remove ${goal.title}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 />
        </IconButton>
      </div>
      {goal.period !== "none" && score.measured && <History score={score} />}
      <div className="flex flex-wrap items-center justify-between gap-2 text-12 text-white/45">
        <span>
          {step ??
            (score.streak > 1
              ? `${score.streak} ${goal.period === "month" ? "months" : "weeks"} in a row`
              : goal.why || " ")}
        </span>
        {goal.metric === "manual" && (
          <SoftButton
            disabled={checkIn.isPending}
            onClick={() =>
              checkIn.mutate({
                path: { goal_id: goal.id },
                body: { day: dayParam(format(new Date(), "yyyy-MM-dd")) },
              })
            }
          >
            <Plus />
            Check in
          </SoftButton>
        )}
      </div>
      <ConfirmDeleteDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${goal.title}?`}
        description="Its history goes with it."
        onConfirm={() => remove.mutate({ path: { goal_id: goal.id } })}
      />
    </div>
  );
}

function AddGoalDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useRefresh();
  const [draft, setDraft] = useState<GoalDraft>(EMPTY_DRAFT);
  const set = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const create = useMutation({
    ...createGoalMutation({ client }),
    onSuccess: () => {
      refresh();
      setDraft(EMPTY_DRAFT);
      onOpenChange(false);
    },
    onError: () => toast.error("Couldn't add the goal"),
  });
  const body = toGoalCreate(draft);
  const metric = METRICS.find((m) => m.value === draft.metric);
  const level = isLevel(draft.metric);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a goal</DialogTitle>
          <DialogDescription>
            Measured from your own data where Bessel has it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (typeof body !== "string") create.mutate({ body });
          }}
        >
          <label className={FIELD}>
            Name
            <TextInput
              value={draft.title}
              placeholder="Asleep by 00:30"
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <label className={FIELD}>
            Measured by
            <select
              className={SELECT}
              value={draft.metric}
              onChange={(e) =>
                set("metric", e.target.value as GoalDraft["metric"])
              }
            >
              {METRICS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="text-white/35">{metric?.hint}</span>
          </label>
          {(draft.metric === "sleep_before" ||
            draft.metric === "wake_before") && (
            <label className={FIELD}>
              By
              <TextInput
                type="time"
                value={draft.time}
                onChange={(e) => set("time", e.target.value)}
              />
            </label>
          )}
          {draft.metric === "tasks_completed" && (
            <label className={FIELD}>
              Project (optional)
              <TextInput
                value={draft.project}
                onChange={(e) => set("project", e.target.value)}
              />
            </label>
          )}
          {draft.metric === "people_met" && (
            <label className={FIELD}>
              Leave out contacts tagged (comma separated)
              <TextInput
                value={draft.excludeTags}
                placeholder="family"
                onChange={(e) => set("excludeTags", e.target.value)}
              />
            </label>
          )}
          {draft.metric === "net_worth" && (
            <div className="grid grid-cols-2 gap-2">
              <label className={FIELD}>
                Currency
                <TextInput
                  value={draft.currency}
                  maxLength={3}
                  onChange={(e) => set("currency", e.target.value)}
                />
              </label>
              <label className={FIELD}>
                Accounts
                <select
                  className={SELECT}
                  value={draft.owner}
                  onChange={(e) =>
                    set("owner", e.target.value as GoalDraft["owner"])
                  }
                >
                  <option value="all">All</option>
                  <option value="personal">Personal</option>
                  <option value="company">Company</option>
                </select>
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className={FIELD}>
              {draft.atMost ? "At most" : "Target"}
              <TextInput
                inputMode="decimal"
                value={draft.target}
                onChange={(e) => set("target", e.target.value)}
              />
            </label>
            {level ? (
              <label className={FIELD}>
                By (optional)
                <TextInput
                  type="date"
                  value={draft.deadline}
                  onChange={(e) => set("deadline", e.target.value)}
                />
              </label>
            ) : (
              <label className={FIELD}>
                Every
                <select
                  className={SELECT}
                  value={draft.period}
                  onChange={(e) =>
                    set("period", e.target.value as GoalDraft["period"])
                  }
                >
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </label>
            )}
          </div>
          <label className="flex items-center gap-2 text-12 text-white/60">
            <input
              type="checkbox"
              checked={draft.atMost}
              onChange={(e) => set("atMost", e.target.checked)}
            />
            A limit: at most this much
          </label>
          <label className="flex items-center gap-2 text-12 text-white/60">
            <input
              type="checkbox"
              checked={draft.isPrivate}
              onChange={(e) => set("isPrivate", e.target.checked)}
            />
            Private: assistants only see it when you ask about it
          </label>
          {typeof body === "string" && draft.title && (
            <p className="text-12 text-amber-300/80">{body}</p>
          )}
          <PrimaryButton
            type="submit"
            disabled={typeof body === "string" || create.isPending}
          >
            Add goal
          </PrimaryButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GoalsPage() {
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery(goalScoreboardOptions({ client }));
  const goals = data?.goals ?? [];
  const behind = goals.filter(
    (g) => g.measured && g.goal.period !== "none" && !g.current.met,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Goals"
        summary={
          goals.length
            ? behind
              ? `${behind} of ${goals.length} not met so far this period`
              : "Every goal met so far this period"
            : isLoading
              ? undefined
              : "What you're working toward, measured from your own data"
        }
      >
        <PrimaryButton size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add goal
        </PrimaryButton>
      </PageHeader>
      {!isLoading && goals.length === 0 ? (
        <EmptyState icon={<Target />} title="No goals yet">
          Add one, or ask Claude to set them up from what it knows about you.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((score) => (
            <GoalCard key={score.goal.id} score={score} />
          ))}
        </div>
      )}
      <ReflectionsSection />
      <GoalPlanSection />
      <AddGoalDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}

import { listTasksOptions } from "@bessel/client";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useCalendarAccounts } from "@/components/calendar/use-calendar-data";
import { TaskFormDialog } from "@/components/create-task-dialog";
import { useOpenSettings } from "@/components/settings-dialog";
import { SoftButton } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { userStorage } from "@/lib/user-storage";
import { cn } from "@/lib/utils";

export const GET_STARTED_KEY = "bessel:get-started";

interface GetStartedState {
  /** Set once the card has been shown, so the Claude step can keep it up. */
  started?: boolean;
  hidden?: boolean;
  claudeOpened?: boolean;
}

function readState(): GetStartedState {
  try {
    return JSON.parse(userStorage.getItem(GET_STARTED_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function useGetStartedState() {
  const [state, setState] = useState(readState);
  const update = (patch: GetStartedState) => {
    const next = { ...readState(), ...patch };
    userStorage.setItem(GET_STARTED_KEY, JSON.stringify(next));
    setState(next);
  };
  return [state, update] as const;
}

/** Opens the full new-task form, fresh each time. */
export function AddTaskButton({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  return (
    <>
      <SoftButton
        onClick={() => {
          setEpoch((n) => n + 1);
          setOpen(true);
        }}
      >
        <Plus />
        {children}
      </SoftButton>
      <TaskFormDialog key={epoch} open={open} onOpenChange={setOpen} />
    </>
  );
}

function Step({
  done,
  title,
  hint,
  action,
}: {
  done: boolean;
  title: string;
  hint: string;
  action: ReactNode;
}) {
  return (
    <li
      aria-label={`${title} - ${done ? "done" : "to do"}`}
      className="flex items-center gap-3 rounded-lg px-2.5 py-2"
    >
      <span
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-full",
          done ? "bg-primary-500/20 text-primary-300" : "bg-white/[0.08]",
        )}
      >
        {done && <Check className="size-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-13",
            done ? "text-white/45 line-through" : "text-white/85",
          )}
        >
          {title}
        </p>
        <p className="mt-0.5 text-12 text-white/45">{hint}</p>
      </div>
      {action}
    </li>
  );
}

/**
 * First steps for a new user, ticked off from their data. Never shown to
 * someone who already has Google connected and tasks, and gone for good once
 * every step is done or it's hidden.
 */
export function GetStartedCard({ className }: { className: string }) {
  const openSettings = useOpenSettings();
  const [state, update] = useGetStartedState();
  const { accounts, isLoading: accountsLoading } = useCalendarAccounts();
  const { data: tasks, isSuccess: tasksLoaded } = useQuery(
    listTasksOptions({ client, query: { page: 1, limit: 1 } }),
  );

  const loaded = !accountsLoading && tasksLoaded;
  const googleDone = accounts.some((a) => a.provider === "google");
  const taskDone = (tasks?.items.length ?? 0) > 0;
  const claudeDone = !!state.claudeOpened;
  const dataPending = !googleDone || !taskDone;

  const shouldStart = loaded && dataPending && !state.started && !state.hidden;
  useEffect(() => {
    if (shouldStart) update({ started: true });
  });

  if (!loaded || state.hidden) return null;
  if (!dataPending && (claudeDone || !state.started)) return null;

  const openIntegrations = () => openSettings("integrations", "add");

  return (
    <section aria-label="Get started" className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h3 className="text-13 font-medium text-white/60">Get started</h3>
        <button
          type="button"
          onClick={() => update({ hidden: true })}
          className="rounded-md px-1.5 py-0.5 text-12 text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/80"
        >
          Hide
        </button>
      </div>
      <ol className="-mx-2.5 flex flex-col">
        <Step
          done={googleDone}
          title="Connect Google"
          hint="Brings in your calendar and contacts."
          action={
            !googleDone && (
              <SoftButton onClick={openIntegrations}>Connect</SoftButton>
            )
          }
        />
        <Step
          done={taskDone}
          title="Add your first task"
          hint="Today shows what's due and what you're doing."
          action={!taskDone && <AddTaskButton>Add task</AddTaskButton>}
        />
        <Step
          done={claudeDone}
          title="Connect Claude"
          hint="Use Bessel from Claude with the connector address."
          action={
            !claudeDone && (
              <SoftButton
                onClick={() => {
                  update({ claudeOpened: true });
                  openIntegrations();
                }}
              >
                Set up
              </SoftButton>
            )
          }
        />
      </ol>
    </section>
  );
}

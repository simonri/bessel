import { listCalendarAccountsOptions, listTasksOptions } from "@bessel/client";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
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

let cached: { raw: string | null; state: GetStartedState } | null = null;

function readState(): GetStartedState {
  const raw = userStorage.getItem(GET_STARTED_KEY);
  if (cached?.raw === raw) return cached.state;
  let state: GetStartedState = {};
  try {
    state = JSON.parse(raw ?? "{}") ?? {};
  } catch {}
  cached = { raw, state };
  return state;
}

// One store, so the card and the cards it stands in for agree on whether it shows.
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateState(patch: GetStartedState) {
  userStorage.setItem(
    GET_STARTED_KEY,
    JSON.stringify({ ...readState(), ...patch }),
  );
  for (const listener of listeners) listener();
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

/** Whether the get started card shows, and which of its steps are done. */
export function useGetStarted() {
  const state = useSyncExternalStore(subscribe, readState);
  const { data: accounts, isSuccess: accountsLoaded } = useQuery(
    listCalendarAccountsOptions({ client }),
  );
  const { data: tasks, isSuccess: tasksLoaded } = useQuery(
    listTasksOptions({ client, query: { page: 1, limit: 1 } }),
  );

  const loaded = accountsLoaded && tasksLoaded;
  const googleDone =
    accounts?.accounts.some((a) => a.provider === "google") ?? false;
  const taskDone = (tasks?.items.length ?? 0) > 0;
  const claudeDone = !!state.claudeOpened;
  const dataPending = !googleDone || !taskDone;

  const shown =
    loaded &&
    !state.hidden &&
    (dataPending || (!claudeDone && !!state.started));
  return {
    shown,
    shouldStart: loaded && dataPending && !state.started && !state.hidden,
    googleDone,
    taskDone,
    claudeDone,
  };
}

/**
 * First steps for a new user, ticked off from their data. Never shown to
 * someone who already has Google connected and tasks, and gone for good once
 * every step is done or it's hidden.
 */
export function GetStartedCard({ className }: { className: string }) {
  const openSettings = useOpenSettings();
  const { shown, shouldStart, googleDone, taskDone, claudeDone } =
    useGetStarted();
  useEffect(() => {
    if (shouldStart) updateState({ started: true });
  });

  if (!shown) return null;

  const openIntegrations = () => openSettings("integrations", "add");

  return (
    <section aria-label="Get started" className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h3 className="text-13 font-medium text-white/60">Get started</h3>
        <button
          type="button"
          onClick={() => updateState({ hidden: true })}
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
                  updateState({ claudeOpened: true });
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

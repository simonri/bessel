import {
  type ContactFollowUp,
  dismissContactAtEventMutation,
  listContactFollowUpsOptions,
} from "@bessel/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SoftButton } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { useLogInteraction, useLogRefresh } from "./use-contact-log";

function NoteFollowUp({ followUp }: { followUp: ContactFollowUp }) {
  const { log, logging } = useLogInteraction();
  const [note, setNote] = useState("");
  const save = (withNote: boolean) =>
    void log(followUp.contact.id, {
      calendar_event_id: followUp.event.id,
      note: withNote ? note.trim() || null : null,
    }).catch(() => {});
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
    >
      <p className="text-13 text-white/85">
        Anything to note about {followUp.contact.display_name}?
        <span className="text-white/40"> - {followUp.event.title}</span>
      </p>
      <div className="flex gap-1.5">
        <input
          aria-label={`Note about ${followUp.contact.display_name}`}
          placeholder="What did you talk about?"
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          className="h-7 min-w-0 flex-1 rounded-md bg-white/[0.05] px-2.5 text-12 text-white/85 ring-1 ring-white/[0.08] outline-none placeholder:text-white/30 focus:ring-primary-400/40"
        />
        <SoftButton type="submit" disabled={logging || !note.trim()}>
          Save
        </SoftButton>
        <SoftButton disabled={logging} onClick={() => save(false)}>
          Skip
        </SoftButton>
      </div>
    </form>
  );
}

function ConfirmFollowUp({ followUp }: { followUp: ContactFollowUp }) {
  const { log, logging } = useLogInteraction();
  const refresh = useLogRefresh();
  const dismiss = useMutation({
    ...dismissContactAtEventMutation({ client }),
    onSuccess: (_, { path }) => refresh(path.contact_id),
    onError: () => toast.error("Couldn't save that"),
  });
  const busy = logging || dismiss.isPending;
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 text-13 text-white/85">
        Was {followUp.contact.display_name} at{" "}
        <span className="text-white/60">{followUp.event.title}</span>?
      </p>
      <div className="flex shrink-0 gap-1.5">
        <SoftButton
          disabled={busy}
          onClick={() =>
            void log(followUp.contact.id, {
              calendar_event_id: followUp.event.id,
            }).catch(() => {})
          }
        >
          Yes
        </SoftButton>
        <SoftButton
          disabled={busy}
          onClick={() =>
            dismiss.mutate({
              client,
              path: { contact_id: followUp.contact.id },
              body: { calendar_event_id: followUp.event.id },
            })
          }
        >
          No
        </SoftButton>
      </div>
    </div>
  );
}

/** "Anything to note about X?" after an event they were at, and "Was X there?" when it's only a guess. */
export function FollowUpList() {
  const { data } = useQuery(listContactFollowUpsOptions({ client }));
  if (!data?.length) return null;
  return (
    <ul aria-label="Follow-ups" className="flex flex-col gap-3">
      {data.map((f) => (
        <li key={`${f.contact.id}-${f.event.id}`}>
          {f.kind === "note" ? (
            <NoteFollowUp followUp={f} />
          ) : (
            <ConfirmFollowUp followUp={f} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function useHasFollowUps(): boolean {
  return !!useQuery(listContactFollowUpsOptions({ client })).data?.length;
}

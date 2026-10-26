import {
  type ContactInteractionCreate,
  deleteContactInteractionMutation,
  getContactRemindersQueryKey,
  listContactFollowUpsQueryKey,
  listContactInteractionsOptions,
  listContactInteractionsQueryKey,
  listContactsQueryKey,
  logContactInteractionMutation,
} from "@bessel/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/lib/client";

/** Everything that depends on someone's log: their timeline, last seen in the list, and the follow-ups. */
export function useLogRefresh() {
  const queryClient = useQueryClient();
  return (contactId: string) => {
    for (const queryKey of [
      listContactInteractionsQueryKey({
        client,
        path: { contact_id: contactId },
      }),
      listContactsQueryKey({ client }),
      listContactFollowUpsQueryKey({ client }),
      getContactRemindersQueryKey({ client }),
    ])
      void queryClient.invalidateQueries({ queryKey });
  };
}

/** Adding to someone's log, from anywhere. */
export function useLogInteraction() {
  const refresh = useLogRefresh();
  const log = useMutation({
    ...logContactInteractionMutation({ client }),
    onSuccess: (_, { path }) => refresh(path.contact_id),
    onError: () => toast.error("Couldn't log that"),
  });
  return {
    logging: log.isPending,
    log: (contactId: string, body: ContactInteractionCreate) =>
      log.mutateAsync({ client, path: { contact_id: contactId }, body }),
  };
}

/** One contact's timeline, with ways to add to and remove from it. */
export function useContactLog(contactId: string) {
  const refresh = useLogRefresh();
  const entries = useQuery(
    listContactInteractionsOptions({ client, path: { contact_id: contactId } }),
  );
  const { log, logging } = useLogInteraction();
  const remove = useMutation({
    ...deleteContactInteractionMutation({ client }),
    onSuccess: () => refresh(contactId),
    onError: () => toast.error("Couldn't delete that"),
  });
  return {
    entries: entries.data ?? [],
    isLoading: entries.isPending,
    logging,
    log: (body: ContactInteractionCreate) => log(contactId, body),
    remove: (interactionId: string) =>
      remove.mutate({
        client,
        path: { contact_id: contactId, interaction_id: interactionId },
      }),
  };
}

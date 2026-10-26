import {
  authorizeContactEditingMutation,
  type ContactSchema,
  type ContactUpdate,
  createContactMutation,
  deleteContactMutation,
  listContactSources,
  listContactSourcesQueryKey,
  listContacts,
  listContactsQueryKey,
  syncContactsMutation,
  updateContactMutation,
  updateContactTagsMutation,
} from "@bessel/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";

const PAGE = 100;
/** How long after "Sync now" the list is fetched again: the sync runs on the worker. */
const SYNC_SETTLE_MS = 4_000;
/** After sending someone to Google to allow editing, how often and how long to check whether they did. */
const PERMISSION_POLL_MS = 3_000;
const PERMISSION_POLL_FOR_MS = 3 * 60_000;

async function allContacts(): Promise<ContactSchema[]> {
  const contacts: ContactSchema[] = [];
  for (let page = 1; ; page++) {
    const { data } = await listContacts({
      client,
      query: { limit: PAGE, page },
      throwOnError: true,
    });
    contacts.push(...data.items);
    if (page >= data.pagination.max_page) return contacts;
  }
}

/** The Google address books contacts come from, and a way to let Bessel edit one. */
export function useContactSources() {
  const [awaitingPermissionUntil, setAwaitingPermissionUntil] = useState(0);
  const sources = useQuery({
    queryKey: listContactSourcesQueryKey({ client }),
    queryFn: async () =>
      (await listContactSources({ client, throwOnError: true })).data,
    refetchInterval: () =>
      Date.now() < awaitingPermissionUntil ? PERMISSION_POLL_MS : false,
  });
  const authorize = useMutation(authorizeContactEditingMutation({ client }));
  return {
    sources: sources.data ?? [],
    /** Opens Google's page for allowing edits, then watches for the permission to arrive. */
    allowEditing: (sourceId: string) => {
      // Browsers only allow a popup opened synchronously from the click.
      const popup = window.electron ? null : window.open("", "_blank");
      authorize.mutate(
        { client, path: { source_id: sourceId } },
        {
          onSuccess: ({ url }) => {
            setAwaitingPermissionUntil(Date.now() + PERMISSION_POLL_FOR_MS);
            if (window.electron) void window.electron.shell.openExternal(url);
            else if (popup) popup.location.href = url;
            else window.location.assign(url);
          },
          onError: () => {
            popup?.close();
            toast.error("Google isn't available right now");
          },
        },
      );
    },
  };
}

/** The whole address book (it's small), where it comes from, and ways to change it. */
export function useContacts() {
  const queryClient = useQueryClient();
  const listKey = listContactsQueryKey({ client });
  const contacts = useQuery({ queryKey: listKey, queryFn: allContacts });
  const { sources, allowEditing } = useContactSources();
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);

  const sync = useMutation({
    ...syncContactsMutation({ client }),
    onSuccess: () => {
      clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: listKey });
        void queryClient.invalidateQueries({
          queryKey: listContactSourcesQueryKey({ client }),
        });
      }, SYNC_SETTLE_MS);
    },
  });

  // Opening the page fetches what changed since the last scheduled sync.
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    sync.mutate({ client });
    return () => clearTimeout(settle.current);
  }, [sync.mutate]);

  const replace = (contact: ContactSchema) =>
    queryClient.setQueryData<ContactSchema[]>(listKey, (old = []) =>
      [...old.filter((c) => c.id !== contact.id), contact].sort((a, b) =>
        a.display_name.localeCompare(b.display_name, "sv", {
          sensitivity: "base",
        }),
      ),
    );
  const failed = (what: string) => (error: unknown) =>
    toast.error(`Couldn't ${what}`, {
      description: errorDetail(
        error,
        "Google didn't take the change, try again.",
      ),
    });

  const update = useMutation({
    ...updateContactMutation({ client }),
    onSuccess: replace,
    onError: failed("save that"),
  });
  const create = useMutation({
    ...createContactMutation({ client }),
    onSuccess: replace,
    onError: failed("add that contact"),
  });
  const remove = useMutation({
    ...deleteContactMutation({ client }),
    onSuccess: (_, { path }) =>
      queryClient.setQueryData<ContactSchema[]>(listKey, (old = []) =>
        old.filter((c) => c.id !== path.contact_id),
      ),
    onError: failed("delete that contact"),
  });
  const tags = useMutation({
    ...updateContactTagsMutation({ client }),
    onSuccess: replace,
    onError: () => toast.error("Couldn't save the tags"),
  });

  return {
    contacts: contacts.data ?? [],
    isLoading: contacts.isPending,
    sources,
    syncNow: () => sync.mutate({ client }),
    syncing: sync.isPending || (sync.isSuccess && contacts.isFetching),
    saving: update.isPending || create.isPending,
    updateContact: (id: string, body: ContactUpdate) =>
      update.mutateAsync({ client, path: { contact_id: id }, body }),
    createContact: (sourceId: string, body: ContactUpdate) =>
      create.mutateAsync({ client, body: { ...body, source_id: sourceId } }),
    deleteContact: (id: string) =>
      remove.mutateAsync({ client, path: { contact_id: id } }),
    /** Bessel's own tags, which never go to Google. */
    setTags: (id: string, list: string[]) =>
      tags.mutate({ client, path: { contact_id: id }, body: { tags: list } }),
    allowEditing,
  };
}

import {
  type ContactSchema,
  listContactSources,
  listContactSourcesQueryKey,
  listContacts,
  listContactsQueryKey,
  syncContactsMutation,
} from "@bessel/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { client } from "@/lib/client";

const PAGE = 100;
/** How long after "Sync now" the list is fetched again: the sync runs on the worker. */
const SYNC_SETTLE_MS = 4_000;

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

/** The whole address book (it's small), where it comes from, and a way to fetch changes now. */
export function useContacts() {
  const queryClient = useQueryClient();
  const contacts = useQuery({
    queryKey: listContactsQueryKey({ client }),
    queryFn: allContacts,
  });
  const sources = useQuery({
    queryKey: listContactSourcesQueryKey({ client }),
    queryFn: async () =>
      (await listContactSources({ client, throwOnError: true })).data,
  });
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);

  const sync = useMutation({
    ...syncContactsMutation({ client }),
    onSuccess: () => {
      clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: listContactsQueryKey({ client }),
        });
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

  return {
    contacts: contacts.data ?? [],
    isLoading: contacts.isPending,
    sources: sources.data ?? [],
    syncNow: () => sync.mutate({ client }),
    syncing: sync.isPending || (sync.isSuccess && contacts.isFetching),
  };
}

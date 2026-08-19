import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import type {
  VaultChangedEvent,
  VaultEntry,
  VaultIndex,
  VaultInfo,
  VaultReadResult,
} from "../vault-types";

function vault() {
  const api = window.electron?.vault;
  if (!api)
    throw new Error("Obsidian vaults are only available in the desktop app");
  return api;
}

export const vaultKeys = {
  all: (root: string) => ["vault", root] as const,
  info: (root: string) => ["vault", root, "info"] as const,
  tree: (root: string) => ["vault", root, "tree"] as const,
  index: (root: string) => ["vault", root, "index"] as const,
  notes: (root: string) => ["vault", root, "note"] as const,
  note: (root: string, rel: string) => ["vault", root, "note", rel] as const,
  search: (root: string, query: string) =>
    ["vault", root, "search", query] as const,
};

export function useVaultInfo(root: string) {
  return useQuery<VaultInfo>({
    queryKey: vaultKeys.info(root),
    queryFn: () => vault().inspect(root),
    staleTime: 60_000,
  });
}

export function useVaultTree(root: string) {
  return useQuery<VaultEntry[]>({
    queryKey: vaultKeys.tree(root),
    queryFn: () => vault().list(root),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Rels of every markdown note — the list link resolution and autocomplete work from. */
export function useVaultFiles(root: string): readonly string[] {
  const { data } = useVaultTree(root);
  return data?.filter((e) => e.kind === "md").map((e) => e.rel) ?? EMPTY;
}
const EMPTY: readonly string[] = [];

export function useVaultIndex(root: string) {
  return useQuery<VaultIndex>({
    queryKey: vaultKeys.index(root),
    queryFn: () => vault().index(root),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useNote(root: string, rel: string | null) {
  return useQuery<VaultReadResult>({
    queryKey: vaultKeys.note(root, rel ?? ""),
    queryFn: () => vault().read(root, rel as string),
    enabled: rel !== null,
    staleTime: Number.POSITIVE_INFINITY,
    // Keep the previous note on screen while the next one loads.
    placeholderData: undefined,
  });
}

export function useVaultSearch(root: string, query: string) {
  return useQuery({
    queryKey: vaultKeys.search(root, query),
    queryFn: () => vault().search(root, query),
    enabled: query.trim().length > 0,
    staleTime: 10_000,
  });
}

function applyChanges(
  queryClient: QueryClient,
  event: VaultChangedEvent,
): void {
  const { root, changes } = event;
  void queryClient.invalidateQueries({ queryKey: vaultKeys.tree(root) });
  void queryClient.invalidateQueries({ queryKey: vaultKeys.index(root) });
  for (const change of changes) {
    if (change.kind === "delete") {
      queryClient.removeQueries({ queryKey: vaultKeys.note(root, change.rel) });
    } else {
      void queryClient.invalidateQueries({
        queryKey: vaultKeys.note(root, change.rel),
      });
    }
  }
}

/**
 * Starts the main-process watcher for `root` while mounted and keeps the query
 * cache in step with on-disk changes (Obsidian Sync, git, the other editor…).
 * `onChange` fires for every batch so views can react (e.g. reload a dirty note).
 */
export function useVaultWatcher(
  root: string,
  onChange?: (event: VaultChangedEvent) => void,
): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const api = vault();
    let active = true;
    void api.watch(root);
    const unsubscribe = api.onChanged((event) => {
      if (!active || event.root !== root) return;
      applyChanges(queryClient, event);
      onChange?.(event);
    });
    return () => {
      active = false;
      unsubscribe();
      void api.unwatch(root);
    };
  }, [root, queryClient, onChange]);
}

export interface SaveNoteInput {
  rel: string;
  content: string;
  /** mtime the buffer was loaded from; null skips the conflict check (force overwrite). */
  expectedMtimeMs: number | null;
}

export function useVaultMutations(root: string) {
  const queryClient = useQueryClient();

  const invalidateTree = useCallback(
    () => queryClient.invalidateQueries({ queryKey: vaultKeys.tree(root) }),
    [queryClient, root],
  );

  const saveNote = useMutation({
    mutationFn: ({ rel, content, expectedMtimeMs }: SaveNoteInput) =>
      vault().write(root, rel, content, expectedMtimeMs),
    onSuccess: ({ mtimeMs }, { rel, content }) => {
      queryClient.setQueryData<VaultReadResult>(vaultKeys.note(root, rel), {
        content,
        mtimeMs,
      });
    },
  });

  const createNote = useMutation({
    mutationFn: ({ rel, content }: { rel: string; content?: string }) =>
      vault().create(root, rel, content),
    onSuccess: invalidateTree,
  });

  const createFolder = useMutation({
    mutationFn: (rel: string) => vault().mkdir(root, rel),
    onSuccess: invalidateTree,
  });

  const renameEntry = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      vault().rename(root, from, to),
    onSuccess: (_, { from }) => {
      queryClient.removeQueries({ queryKey: vaultKeys.note(root, from) });
      void invalidateTree();
      void queryClient.invalidateQueries({ queryKey: vaultKeys.index(root) });
    },
  });

  const trashEntry = useMutation({
    mutationFn: (rel: string) => vault().trash(root, rel),
    onSuccess: (_, rel) => {
      queryClient.removeQueries({ queryKey: vaultKeys.note(root, rel) });
      void invalidateTree();
    },
  });

  const writeBinary = useMutation({
    mutationFn: ({ rel, data }: { rel: string; data: Uint8Array }) =>
      vault().writeBinary(root, rel, data),
    onSuccess: invalidateTree,
  });

  return {
    saveNote,
    createNote,
    createFolder,
    renameEntry,
    trashEntry,
    writeBinary,
  };
}

/** Reads a note outside React (embeds, link previews). Cached through the query client. */
export function useReadNote(root: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (rel: string) =>
      queryClient.fetchQuery<VaultReadResult>({
        queryKey: vaultKeys.note(root, rel),
        queryFn: () => vault().read(root, rel),
        staleTime: Number.POSITIVE_INFINITY,
      }),
    [queryClient, root],
  );
}

import type { AccountOverview, AvanzaConnectionSchema } from "@bessel/client";
import {
  authorizeBankConnectionMutation,
  authorizeMontroseMutation,
  connectAvanzaMutation,
  getAccountsOverviewQueryKey,
  getAvanzaQueryKey,
  getMontroseQueryKey,
  getNetWorthHistoryQueryKey,
  listBankConnectionsOptions,
  listBankConnectionsQueryKey,
  listTransactionsQueryKey,
  syncAvanzaMutation,
  syncBankConnectionMutation,
  syncMontroseMutation,
} from "@bessel/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import {
  AvanzaConnectDialog,
  type AvanzaLogin,
} from "@/components/avanza/avanza-connect-dialog";
import { ImportDialog, type ImportPreset } from "@/components/import-dialog";
import type { FixAction } from "@/lib/account-labels";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";

// A sync runs in the background; keep refreshing for a while so its result shows.
export const SYNC_POLL_MS = 4_000;
const SYNC_POLL_WINDOW_MS = 90_000;
/** Set before leaving for a bank's approval, so the accounts page can pick up where it left off. */
export const CONNECTING_BANK_KEY = "bessel:connecting-bank";

export type PickSource =
  | { kind: "bank"; bankName: string }
  | { kind: "avanza" }
  | { kind: "montrose" };

interface AccountActions {
  run: (action: FixAction, account: AccountOverview) => void;
  connectBank: (bankName: string) => void;
  connectAvanza: () => void;
  /** Off to Montrose's BankID login; it comes back to the callback page. */
  connectMontrose: () => void;
  upload: (preset?: ImportPreset) => void;
  /** Choose which of a connection's accounts to bring in. */
  pick: (source: PickSource) => void;
  /** Until when a sync just asked for may still be landing, to keep refreshing. */
  pollUntil: number;
  busy: boolean;
}

const Context = createContext<AccountActions | null>(null);

export function useAccountActions(): AccountActions {
  const actions = useContext(Context);
  if (!actions)
    throw new Error("useAccountActions needs AccountActionsProvider");
  return actions;
}

/** Everything that fixes or adds an account, with the dialogs it needs. */
export function AccountActionsProvider({
  onReview,
  onAvanzaConnected,
  onPick,
  children,
}: {
  onReview: (account: AccountOverview) => void;
  /** A first Avanza login, whose accounts are still to be chosen. */
  onAvanzaConnected: () => void;
  onPick: (source: PickSource) => void;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [pollUntil, setPollUntil] = useState(0);
  const [importing, setImporting] = useState<ImportPreset | null>(null);
  const [avanzaLogin, setAvanzaLogin] = useState(false);
  const { data: connections } = useQuery(
    listBankConnectionsOptions({ client }),
  );

  const refresh = useCallback(() => {
    setPollUntil(Date.now() + SYNC_POLL_WINDOW_MS);
    for (const queryKey of [
      getAccountsOverviewQueryKey({ client }),
      getNetWorthHistoryQueryKey({ client }),
      listBankConnectionsQueryKey({ client }),
      getAvanzaQueryKey({ client }),
      getMontroseQueryKey({ client }),
      listTransactionsQueryKey({ client }),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);

  const authorize = useMutation({
    ...authorizeBankConnectionMutation({
      client,
    }),
    onSuccess: ({ url }, { body }) => {
      try {
        sessionStorage.setItem(CONNECTING_BANK_KEY, body.bank_name);
      } catch {}
      if (window.electron) void window.electron.shell.openExternal(url);
      else window.location.assign(url);
    },
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't open the bank's approval")),
  });
  const authorizeMontrose = useMutation({
    ...authorizeMontroseMutation({ client }),
    onSuccess: ({ url }) => {
      if (window.electron) void window.electron.shell.openExternal(url);
      else window.location.assign(url);
    },
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't open Montrose's login")),
  });
  const syncMontrose = useMutation({
    ...syncMontroseMutation({ client }),
    onSuccess: () => {
      toast.success("Updating - this takes a minute");
      refresh();
    },
    onError: (error) => toast.error(errorDetail(error, "Couldn't update")),
  });
  const syncBank = useMutation({
    ...syncBankConnectionMutation({
      client,
    }),
    onSuccess: () => {
      toast.success("Updating - this takes a minute");
      refresh();
    },
    onError: (error) => toast.error(errorDetail(error, "Couldn't update")),
  });
  const syncAvanza = useMutation({
    ...syncAvanzaMutation({ client }),
    onSuccess: () => {
      toast.success("Updating - this takes a minute");
      refresh();
    },
    onError: (error) => toast.error(errorDetail(error, "Couldn't update")),
  });
  const connectAvanzaLogin = useMutation({
    ...connectAvanzaMutation({ client }),
    onSuccess: refresh,
  });

  const connectBank = useCallback(
    (bankName: string) =>
      authorize.mutate({ client, body: { bank_name: bankName } }),
    [authorize],
  );

  const connectMontrose = useCallback(
    () => authorizeMontrose.mutate({ client }),
    [authorizeMontrose],
  );

  const run = useCallback(
    (action: FixAction, account: AccountOverview) => {
      const { source } = account;
      switch (action) {
        case "renew":
          if (source.kind === "montrose") connectMontrose();
          else connectBank(source.label);
          return;
        case "sync": {
          if (source.kind === "avanza") {
            syncAvanza.mutate({ client });
            return;
          }
          if (source.kind === "montrose") {
            syncMontrose.mutate({ client });
            return;
          }
          const connection = connections?.connections.find(
            (c) => c.bank_name === source.label,
          );
          if (connection) {
            syncBank.mutate({
              client,
              path: { connection_id: connection.id },
            });
          }
          return;
        }
        case "sign_in":
          if (source.kind === "montrose") connectMontrose();
          else setAvanzaLogin(true);
          return;
        case "upload":
          setImporting({
            source: source.import_bank,
            bankAccountId: account.id,
          });
          return;
        case "import_klarna":
          setImporting({ source: "klarna", bankAccountId: account.id });
          return;
        case "review":
          onReview(account);
          return;
      }
    },
    [
      connectBank,
      connectMontrose,
      connections,
      onReview,
      syncAvanza,
      syncBank,
      syncMontrose,
    ],
  );

  const submitAvanzaLogin = async (login: AvanzaLogin) => {
    let connection: AvanzaConnectionSchema;
    try {
      connection = await connectAvanzaLogin.mutateAsync({
        client,
        body: {
          username: login.username,
          password: login.password,
          totp_secret: login.totpSecret,
        },
      });
    } catch (error) {
      throw new Error(errorDetail(error, "Couldn't connect Avanza."));
    }
    if (!connection.accounts.some((a) => a.bank_account_id)) {
      onAvanzaConnected();
    }
  };

  const value = useMemo<AccountActions>(
    () => ({
      run,
      connectBank,
      connectAvanza: () => setAvanzaLogin(true),
      connectMontrose,
      upload: (preset) => setImporting(preset ?? {}),
      pick: onPick,
      pollUntil,
      busy:
        authorize.isPending ||
        authorizeMontrose.isPending ||
        syncBank.isPending ||
        syncAvanza.isPending ||
        syncMontrose.isPending,
    }),
    [
      run,
      connectBank,
      connectMontrose,
      onPick,
      pollUntil,
      authorize.isPending,
      authorizeMontrose.isPending,
      syncBank.isPending,
      syncAvanza.isPending,
      syncMontrose.isPending,
    ],
  );

  return (
    <Context.Provider value={value}>
      {children}
      <ImportDialog
        open={importing !== null}
        onOpenChange={(open) => !open && setImporting(null)}
        preset={importing ?? undefined}
      />
      <AvanzaConnectDialog
        open={avanzaLogin}
        onOpenChange={setAvanzaLogin}
        onConnect={submitAvanzaLogin}
      />
    </Context.Provider>
  );
}

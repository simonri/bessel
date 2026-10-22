import type { AccountOverview, AvanzaConnectionSchema } from "@bessel/client";
import {
  authorizeBankConnectionV1BankConnectionsAuthorizePostMutation,
  connectAvanzaV1AvanzaConnectPostMutation,
  getAccountsOverviewV1BankAccountsOverviewGetQueryKey,
  getAvanzaV1AvanzaGetQueryKey,
  getNetWorthHistoryV1BankAccountsNetWorthGetQueryKey,
  listBankConnectionsV1BankConnectionsGetOptions,
  listBankConnectionsV1BankConnectionsGetQueryKey,
  listTransactionsV1TransactionsGetQueryKey,
  syncAvanzaV1AvanzaSyncPostMutation,
  syncBankConnectionV1BankConnectionsConnectionIdSyncPostMutation,
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
  | { kind: "avanza" };

interface AccountActions {
  run: (action: FixAction, account: AccountOverview) => void;
  connectBank: (bankName: string) => void;
  connectAvanza: () => void;
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
    listBankConnectionsV1BankConnectionsGetOptions({ client }),
  );

  const refresh = useCallback(() => {
    setPollUntil(Date.now() + SYNC_POLL_WINDOW_MS);
    for (const queryKey of [
      getAccountsOverviewV1BankAccountsOverviewGetQueryKey({ client }),
      getNetWorthHistoryV1BankAccountsNetWorthGetQueryKey({ client }),
      listBankConnectionsV1BankConnectionsGetQueryKey({ client }),
      getAvanzaV1AvanzaGetQueryKey({ client }),
      listTransactionsV1TransactionsGetQueryKey({ client }),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);

  const authorize = useMutation({
    ...authorizeBankConnectionV1BankConnectionsAuthorizePostMutation({
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
  const syncBank = useMutation({
    ...syncBankConnectionV1BankConnectionsConnectionIdSyncPostMutation({
      client,
    }),
    onSuccess: () => {
      toast.success("Updating - this takes a minute");
      refresh();
    },
    onError: (error) => toast.error(errorDetail(error, "Couldn't update")),
  });
  const syncAvanza = useMutation({
    ...syncAvanzaV1AvanzaSyncPostMutation({ client }),
    onSuccess: () => {
      toast.success("Updating - this takes a minute");
      refresh();
    },
    onError: (error) => toast.error(errorDetail(error, "Couldn't update")),
  });
  const connectAvanzaLogin = useMutation({
    ...connectAvanzaV1AvanzaConnectPostMutation({ client }),
    onSuccess: refresh,
  });

  const connectBank = useCallback(
    (bankName: string) =>
      authorize.mutate({ client, body: { bank_name: bankName } }),
    [authorize],
  );

  const run = useCallback(
    (action: FixAction, account: AccountOverview) => {
      const { source } = account;
      switch (action) {
        case "renew":
          connectBank(source.label);
          return;
        case "sync": {
          if (source.kind === "avanza") {
            syncAvanza.mutate({ client });
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
          setAvanzaLogin(true);
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
    [connectBank, connections, onReview, syncAvanza, syncBank],
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
      upload: (preset) => setImporting(preset ?? {}),
      pick: onPick,
      pollUntil,
      busy: authorize.isPending || syncBank.isPending || syncAvanza.isPending,
    }),
    [
      run,
      connectBank,
      onPick,
      pollUntil,
      authorize.isPending,
      syncBank.isPending,
      syncAvanza.isPending,
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

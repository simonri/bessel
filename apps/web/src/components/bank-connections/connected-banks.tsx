import type {
  BankAccountSchema,
  BankConnectionAccountSchema,
  BankConnectionSchema,
} from "@bessel/client";
import {
  authorizeBankConnectionV1BankConnectionsAuthorizePostMutation,
  disconnectBankConnectionV1BankConnectionsConnectionIdDeleteMutation,
  linkBankConnectionAccountV1BankConnectionsAccountsAccountIdPatchMutation,
  listBankAccountsV1BankAccountsGetOptions,
  listBankConnectionsV1BankConnectionsGetOptions,
  listBankConnectionsV1BankConnectionsGetQueryKey,
  listTransactionsV1TransactionsGetQueryKey,
  syncBankConnectionV1BankConnectionsConnectionIdSyncPostMutation,
} from "@bessel/client";
import {
  NativeSelect,
  NativeSelectOption,
} from "@bessel/ui/components/native-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInDays, format, formatDistanceToNow } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import {
  Panel,
  PanelRow,
  PrimaryButton,
  SectionLabel,
  SoftButton,
} from "@/components/ui-kit";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const NOT_IMPORTING = "none";
// A sync runs in the background; keep refreshing for a while so its result shows.
const SYNC_POLL_MS = 4_000;
const SYNC_POLL_WINDOW_MS = 90_000;
const RENEW_WARNING_DAYS = 14;

/** Banks Bessel reads transactions from, shown only to users who may connect one. */
export function ConnectedBanks() {
  const queryClient = useQueryClient();
  const [pollUntil, setPollUntil] = useState(0);
  const [disconnecting, setDisconnecting] =
    useState<BankConnectionSchema | null>(null);
  const queryKey = listBankConnectionsV1BankConnectionsGetQueryKey({ client });

  const { data } = useQuery({
    ...listBankConnectionsV1BankConnectionsGetOptions({ client }),
    refetchInterval: () => (Date.now() < pollUntil ? SYNC_POLL_MS : false),
  });
  const { data: accounts } = useQuery({
    ...listBankAccountsV1BankAccountsGetOptions({
      client,
      query: { limit: 100, page: 1, sorting: ["name"] },
    }),
    enabled: !!data?.connections.length,
  });

  // New transactions arrive with a finished sync, so refresh them when one lands.
  const lastSynced = useRef<string | undefined>(undefined);
  const syncedAt = data?.connections.map((c) => c.last_synced_at).join();
  useEffect(() => {
    if (lastSynced.current !== undefined && lastSynced.current !== syncedAt) {
      void queryClient.invalidateQueries({
        queryKey: listTransactionsV1TransactionsGetQueryKey({ client }),
      });
    }
    lastSynced.current = syncedAt;
  }, [syncedAt, queryClient]);

  const refresh = () => {
    setPollUntil(Date.now() + SYNC_POLL_WINDOW_MS);
    void queryClient.invalidateQueries({ queryKey });
  };

  const authorize = useMutation({
    ...authorizeBankConnectionV1BankConnectionsAuthorizePostMutation({
      client,
    }),
    onSuccess: ({ url }) => {
      if (window.electron) void window.electron.shell.openExternal(url);
      else window.location.assign(url);
    },
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't start the connection")),
  });
  const link = useMutation({
    ...linkBankConnectionAccountV1BankConnectionsAccountsAccountIdPatchMutation(
      { client },
    ),
    onSuccess: refresh,
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't change the account")),
  });
  const sync = useMutation({
    ...syncBankConnectionV1BankConnectionsConnectionIdSyncPostMutation({
      client,
    }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorDetail(error, "Couldn't sync")),
  });
  const disconnect = useMutation({
    ...disconnectBankConnectionV1BankConnectionsConnectionIdDeleteMutation({
      client,
    }),
    onSuccess: () => {
      setDisconnecting(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(errorDetail(error, "Couldn't disconnect")),
  });

  if (!data || (!data.available && data.connections.length === 0)) return null;
  const connect = (bankName: string) =>
    authorize.mutate({ client, body: { bank_name: bankName } });
  const connected = new Set(data.connections.map((c) => c.bank_name));
  const unconnected = data.available
    ? data.banks.filter((bank) => !connected.has(bank))
    : [];

  return (
    <section>
      <SectionLabel
        action={
          unconnected.length > 0 && (
            <div className="flex gap-2">
              {unconnected.map((bank) => (
                <PrimaryButton
                  key={bank}
                  size="sm"
                  onClick={() => connect(bank)}
                  disabled={authorize.isPending}
                >
                  Connect {bank}
                </PrimaryButton>
              ))}
            </div>
          )
        }
      >
        Connected banks
      </SectionLabel>
      {data.connections.length === 0 ? (
        <p className="text-12 text-white/45">
          Import transactions from your banks automatically instead of uploading
          exports. You approve at each bank, about twice a year.
        </p>
      ) : (
        <div className="space-y-3">
          {data.connections.map((connection) => (
            <Panel key={connection.id}>
              <PanelRow
                label={connection.bank_name}
                description={<ConnectionStatus connection={connection} />}
              >
                <SoftButton
                  onClick={() =>
                    sync.mutate({
                      client,
                      path: { connection_id: connection.id },
                    })
                  }
                  disabled={sync.isPending}
                >
                  Sync now
                </SoftButton>
                {data.available &&
                  data.banks.includes(connection.bank_name) && (
                    <SoftButton
                      onClick={() => connect(connection.bank_name)}
                      disabled={authorize.isPending}
                    >
                      Renew
                    </SoftButton>
                  )}
                <SoftButton onClick={() => setDisconnecting(connection)}>
                  Disconnect
                </SoftButton>
              </PanelRow>
              {connection.accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  bankName={connection.bank_name}
                  bankAccounts={accounts?.items ?? []}
                  onLink={(bankAccountId) =>
                    link.mutate({
                      client,
                      path: { account_id: account.id },
                      body: { bank_account_id: bankAccountId },
                    })
                  }
                />
              ))}
            </Panel>
          ))}
        </div>
      )}
      <ConfirmDeleteDialog
        size="sm"
        open={!!disconnecting}
        onOpenChange={(open) => !open && setDisconnecting(null)}
        title={`Disconnect ${disconnecting?.bank_name ?? "bank"}?`}
        description="Bessel stops importing from it. Transactions already imported stay."
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        isPending={disconnect.isPending}
        onConfirm={() => {
          if (!disconnecting) return;
          disconnect.mutate({
            client,
            path: { connection_id: disconnecting.id },
          });
        }}
      />
    </section>
  );
}

function ConnectionStatus({
  connection,
}: {
  connection: BankConnectionSchema;
}) {
  const validUntil = new Date(connection.valid_until);
  const endingSoon =
    differenceInDays(validUntil, new Date()) < RENEW_WARNING_DAYS;
  const synced = connection.sync_error
    ? connection.sync_error
    : connection.last_synced_at
      ? `Synced ${formatDistanceToNow(connection.last_synced_at, { addSuffix: true })}`
      : "Not synced yet";
  return (
    <span className={cn(connection.sync_error && "text-amber-300/90")}>
      {synced} -{" "}
      <span className={cn(endingSoon && "text-amber-300/90")}>
        approved until {format(validUntil, "d MMM yyyy")}
      </span>
    </span>
  );
}

function AccountRow({
  account,
  bankName,
  bankAccounts,
  onLink,
}: {
  account: BankConnectionAccountSchema;
  bankName: string;
  bankAccounts: BankAccountSchema[];
  onLink: (bankAccountId: string | null) => void;
}) {
  const ending = account.iban ? `Ending ${account.iban.slice(-4)}` : null;
  const importing = !account.shared
    ? "left out of the latest approval, renew to include it"
    : account.import_from
      ? `importing from ${format(account.import_from, "d MMM yyyy")}`
      : "not imported";
  // Bessel's balance should match the bank's; a gap means a transaction was missed, doubled or is pending.
  const drift =
    account.balance_drift && account.bank_balance !== null
      ? `${bankName} says ${formatMoney(account.bank_balance, account.currency)}, Bessel ${formatMoney(account.bank_balance - account.balance_drift, account.currency)}`
      : null;
  return (
    <PanelRow
      className="pl-8"
      label={account.name ?? bankName}
      description={
        <span className={cn(drift && "text-amber-300/90")}>
          {[ending, importing, drift].filter(Boolean).join(" - ")}
        </span>
      }
    >
      <NativeSelect
        size="sm"
        className="w-48 text-12"
        aria-label={`Import ${account.name ?? bankName} into`}
        value={account.bank_account_id ?? NOT_IMPORTING}
        onChange={(event) =>
          onLink(
            event.target.value === NOT_IMPORTING ? null : event.target.value,
          )
        }
      >
        <NativeSelectOption value={NOT_IMPORTING}>
          Don't import
        </NativeSelectOption>
        {bankAccounts
          .filter((a) => a.currency === account.currency)
          .map((a) => (
            <NativeSelectOption key={a.id} value={a.id}>
              {a.name}
            </NativeSelectOption>
          ))}
      </NativeSelect>
    </PanelRow>
  );
}

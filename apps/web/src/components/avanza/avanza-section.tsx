import type { AvanzaAccountSchema, BankAccountSchema } from "@bessel/client";
import {
  connectAvanzaV1AvanzaConnectPostMutation,
  disconnectAvanzaV1AvanzaDeleteMutation,
  getAvanzaV1AvanzaGetOptions,
  getAvanzaV1AvanzaGetQueryKey,
  linkAvanzaAccountV1AvanzaAccountsAccountIdPatchMutation,
  listBankAccountsV1BankAccountsGetOptions,
  listBankAccountsV1BankAccountsGetQueryKey,
  listTransactionsV1TransactionsGetQueryKey,
  syncAvanzaV1AvanzaSyncPostMutation,
} from "@bessel/client";
import {
  NativeSelect,
  NativeSelectOption,
} from "@bessel/ui/components/native-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
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
import { AvanzaConnectDialog, type AvanzaLogin } from "./avanza-connect-dialog";

const NOT_IMPORTING = "none";
// A sync runs in the background; keep refreshing for a while so its result shows.
const SYNC_POLL_MS = 4_000;
const SYNC_POLL_WINDOW_MS = 120_000;

const ACCOUNT_TYPES: Record<string, string> = {
  INVESTERINGSSPARKONTO: "ISK",
  KAPITALFORSAKRING: "KF",
  AKTIEFONDKONTO: "AF",
  SPARKONTO: "Savings",
  TJANSTEPENSION: "Occupational pension",
  PENSIONSFORSAKRING: "Pension",
};

/** The Avanza connection, shown only to users who may store an Avanza login. */
export function AvanzaSection() {
  const queryClient = useQueryClient();
  const [pollUntil, setPollUntil] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const queryKey = getAvanzaV1AvanzaGetQueryKey({ client });

  const { data } = useQuery({
    ...getAvanzaV1AvanzaGetOptions({ client }),
    refetchInterval: () => (Date.now() < pollUntil ? SYNC_POLL_MS : false),
  });
  const connection = data?.connection;
  const { data: bankAccounts } = useQuery({
    ...listBankAccountsV1BankAccountsGetOptions({
      client,
      query: { limit: 100, page: 1, sorting: ["name"] },
    }),
    enabled: !!connection,
  });

  // New transactions and balances arrive with a finished sync.
  const lastSynced = useRef<string | null | undefined>(undefined);
  const syncedAt = connection?.last_synced_at?.toISOString() ?? null;
  useEffect(() => {
    if (lastSynced.current !== undefined && lastSynced.current !== syncedAt) {
      void queryClient.invalidateQueries({
        queryKey: listTransactionsV1TransactionsGetQueryKey({ client }),
      });
      void queryClient.invalidateQueries({
        queryKey: listBankAccountsV1BankAccountsGetQueryKey({ client }),
      });
    }
    lastSynced.current = syncedAt;
  }, [syncedAt, queryClient]);

  const refresh = () => {
    setPollUntil(Date.now() + SYNC_POLL_WINDOW_MS);
    void queryClient.invalidateQueries({ queryKey });
  };

  const connect = useMutation({
    ...connectAvanzaV1AvanzaConnectPostMutation({ client }),
    onSuccess: refresh,
  });
  const link = useMutation({
    ...linkAvanzaAccountV1AvanzaAccountsAccountIdPatchMutation({ client }),
    onSuccess: refresh,
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't change the account")),
  });
  const sync = useMutation({
    ...syncAvanzaV1AvanzaSyncPostMutation({ client }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorDetail(error, "Couldn't sync")),
  });
  const disconnect = useMutation({
    ...disconnectAvanzaV1AvanzaDeleteMutation({ client }),
    onSuccess: () => {
      setDisconnecting(false);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(errorDetail(error, "Couldn't disconnect")),
  });

  if (!data || (!data.available && !connection)) return null;

  const submitLogin = async (login: AvanzaLogin) => {
    try {
      await connect.mutateAsync({
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
  };

  const status = connection?.sync_error
    ? connection.sync_error
    : connection?.last_synced_at
      ? `Synced ${formatDistanceToNow(connection.last_synced_at, { addSuffix: true })}`
      : "Not synced yet";

  return (
    <section>
      <SectionLabel
        action={
          data.available &&
          !connection && (
            <PrimaryButton size="sm" onClick={() => setConnecting(true)}>
              Connect Avanza
            </PrimaryButton>
          )
        }
      >
        Avanza
      </SectionLabel>
      {!connection ? (
        <p className="text-12 text-white/45">
          Import Avanza transactions, trades and holdings automatically. Needs
          your username, password and a TOTP secret for two-factor login.
        </p>
      ) : (
        <Panel>
          <PanelRow
            label="Avanza"
            description={
              <span
                className={cn(connection.sync_error && "text-amber-300/90")}
              >
                {connection.username} - {status}
              </span>
            }
          >
            <SoftButton
              onClick={() => sync.mutate({ client })}
              disabled={sync.isPending || connection.credentials_rejected}
            >
              Sync now
            </SoftButton>
            {data.available && (
              <SoftButton onClick={() => setConnecting(true)}>
                Update login
              </SoftButton>
            )}
            <SoftButton onClick={() => setDisconnecting(true)}>
              Disconnect
            </SoftButton>
          </PanelRow>
          {connection.accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              bankAccounts={bankAccounts?.items ?? []}
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
      )}
      <AvanzaConnectDialog
        open={connecting}
        onOpenChange={setConnecting}
        onConnect={submitLogin}
        username={connection?.username}
      />
      <ConfirmDeleteDialog
        size="sm"
        open={disconnecting}
        onOpenChange={setDisconnecting}
        title="Disconnect Avanza?"
        description="Bessel deletes the stored login and stops importing. Transactions, trades and holdings already imported stay."
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        isPending={disconnect.isPending}
        onConfirm={() => disconnect.mutate({ client })}
      />
    </section>
  );
}

function AccountRow({
  account,
  bankAccounts,
  onLink,
}: {
  account: AvanzaAccountSchema;
  bankAccounts: BankAccountSchema[];
  onLink: (bankAccountId: string | null) => void;
}) {
  const linked = bankAccounts.find((a) => a.id === account.bank_account_id);
  const cash =
    account.cash_balance === null
      ? null
      : `${formatMoney(account.cash_balance, "SEK")} cash`;
  // The imported history should add up to Avanza's cash; a gap means rows were missed.
  const mismatch =
    linked &&
    account.last_synced_at &&
    account.cash_balance !== null &&
    linked.current_balance !== account.cash_balance
      ? `Bessel shows ${formatMoney(linked.current_balance ?? 0, linked.currency)}`
      : null;
  const type = ACCOUNT_TYPES[account.account_type] ?? account.account_type;
  return (
    <PanelRow
      className="pl-8"
      label={`${account.name} (${type})`}
      description={
        <span className={cn(mismatch && "text-amber-300/90")}>
          {[cash, mismatch].filter(Boolean).join(" - ") || " "}
        </span>
      }
    >
      <NativeSelect
        size="sm"
        className="w-48 text-12"
        aria-label={`Import ${account.name} into`}
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
          .filter((a) => a.currency === "SEK")
          .map((a) => (
            <NativeSelectOption key={a.id} value={a.id}>
              {a.name}
            </NativeSelectOption>
          ))}
      </NativeSelect>
    </PanelRow>
  );
}

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format, isToday, isYesterday } from "date-fns";
import {
  getKlarnaTransactionsV1KlarnaTransactionsGet,
  importKlarnaTransactionsV1KlarnaImportPostMutation,
  listBankAccountsV1BankAccountsGetOptions,
  listTransactionsV1TransactionsGetQueryKey,
} from "@metron/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@metron/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metron/ui/components/select";
import { toast } from "sonner";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/klarna")({
  component: Klarna,
});

interface KlarnaTransaction {
  __typename: string;
  title: string;
  uniqueId: string;
  isPending: boolean;
  createdAt: string;
  avatar?: {
    logoUrl?: { url?: string; x2?: { url?: string } };
    fallbackCharacter?: string;
  };
  amount?: {
    amountText?: string;
    currency?: string;
    amount?: number;
    amountColorToken?: string;
    hasPlus?: boolean;
  };
  subtitle?: { text?: string | null; icon?: string | null }[];
  groupHeader?: { text?: string };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function Avatar({ tx }: { tx: KlarnaTransaction }) {
  const logoUrl = tx.avatar?.logoUrl?.x2?.url ?? tx.avatar?.logoUrl?.url;
  const fallback = tx.avatar?.fallbackCharacter ?? tx.title?.[0] ?? "?";

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={tx.title}
        className="size-8 rounded-full object-contain bg-muted"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground select-none">
      {fallback.toUpperCase()}
    </div>
  );
}

function Klarna() {
  const [token, setToken] = useState("");
  const [cookie, setCookie] = useState("");
  const [transactions, setTransactions] = useState<KlarnaTransaction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const queryClient = useQueryClient();

  const { data: accountsData } = useQuery(
    listBankAccountsV1BankAccountsGetOptions({ client, query: { limit: 100, sorting: ["name"] } }),
  );
  const accounts = accountsData?.items ?? [];

  const importMutation = useMutation({
    ...importKlarnaTransactionsV1KlarnaImportPostMutation({ client }),
    onSuccess: (data) => {
      toast.success(`${data.created} imported, ${data.skipped} already in Metron`);
      void queryClient.invalidateQueries({
        queryKey: listTransactionsV1TransactionsGetQueryKey({ client }),
      });
    },
    onError: () => toast.error("Import failed"),
  });

  const handleImport = () => {
    if (!selectedAccountId) return;
    const bearer = token.trim().startsWith("Bearer ") ? token.trim() : `Bearer ${token.trim()}`;
    importMutation.mutate({
      client,
      body: {
        bank_account_id: selectedAccountId,
        authorization: bearer,
        cookie: cookie.trim() || null,
      },
    });
  };

  const fetchTransactions = async () => {
    const bearer = token.trim().startsWith("Bearer ") ? token.trim() : `Bearer ${token.trim()}`;
    setLoading(true);
    setError(null);
    setTransactions(null);

    try {
      const data = await getKlarnaTransactionsV1KlarnaTransactionsGet({
        client,
        headers: {
          authorization: bearer,
          ...(cookie.trim() ? { cookie: cookie.trim() } : {}),
        },
      });

      const items: KlarnaTransaction[] =
        (data.data as any)?.data?.transactionsList?.items?.filter(
          (item: any) => item.__typename === "TransactionStateV2MasterOutput",
        ) ?? [];

      // Log first item to inspect actual field shapes
      if (items[0]) console.debug("[klarna] first item amount:", items[0].amount);
      setTransactions(items);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch transactions");
    } finally {
      setLoading(false);
    }
  };

  // Group by date
  const grouped: { label: string; items: KlarnaTransaction[] }[] = [];
  if (transactions) {
    const map = new Map<string, KlarnaTransaction[]>();
    for (const tx of transactions) {
      const label = formatDate(tx.createdAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(tx);
    }
    for (const [label, items] of map) {
      grouped.push({ label, items });
    }
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Klarna</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Paste your Klarna Bearer token to view recent transactions.
        </p>
      </div>

      <section className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Authorization header
          </p>
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="eyJhbGciOi…"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Devtools → Network → any Klarna request → Headers → <code className="font-mono">authorization</code>
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Cookie header
          </p>
          <textarea
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            placeholder="OptanonConsent=…; sessionId=…; klarna_synced_login=…"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Same request → Headers → <code className="font-mono">cookie</code>
          </p>
        </div>

        <Button
          onClick={fetchTransactions}
          disabled={!token.trim() || loading}
          size="sm"
        >
          {loading ? "Fetching…" : "Fetch transactions"}
        </Button>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </section>

      {transactions !== null && transactions.length > 0 && (
        <section className="space-y-3 animate-in fade-in duration-150">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Import to Metron
          </p>
          <div className="flex items-center gap-3">
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="w-56 h-8 text-sm">
                <SelectValue placeholder="Select account…" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={!selectedAccountId || importMutation.isPending}
            >
              {importMutation.isPending ? "Importing…" : `Import ${transactions.length} transactions`}
            </Button>
          </div>
          {importMutation.data && (
            <p className="text-sm text-muted-foreground">
              {importMutation.data.created} imported · {importMutation.data.skipped} already in Metron
            </p>
          )}
        </section>
      )}

      {transactions !== null && (
        <section className="animate-in fade-in duration-150 space-y-8">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
          </p>

          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions found.</p>
          ) : (
            grouped.map(({ label, items }) => (
              <div key={label} className="space-y-0">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground pb-2">
                  {label}
                </p>
                <div className="divide-y">
                  {items.map((tx) => {
                    const a = tx.amount as any;
                    // amount.amount is already a formatted string e.g. "350 kr"
                    const amountDisplay: string | null = typeof a?.amount === "string" ? a.amount : null;
                    const isRefund = a?.hasPlus === true;
                    const isRejected = a?.isAmountLineThrough === true;
                    // subtitle is an array; skip the time entry (no icon), show payment method (has icon)
                    const subtitleText = Array.isArray(tx.subtitle)
                      ? tx.subtitle.find((s) => s.icon)?.text ?? tx.subtitle[1]?.text
                      : null;

                    return (
                      <div
                        key={tx.uniqueId}
                        className={`flex items-center gap-3 py-3 first:pt-0 last:pb-0 ${isRejected ? "opacity-40" : ""}`}
                      >
                        <Avatar tx={tx} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{tx.title}</p>
                          {subtitleText && (
                            <p className="text-xs text-muted-foreground truncate">{subtitleText}</p>
                          )}
                          {tx.isPending && (
                            <p className="text-xs text-muted-foreground">Pending</p>
                          )}
                        </div>
                        {amountDisplay && (
                          <p className={`shrink-0 text-sm tabular-nums font-medium ${isRefund ? "text-income" : ""}`}>
                            {amountDisplay}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}

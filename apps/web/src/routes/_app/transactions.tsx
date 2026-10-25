import type { TransactionSchema } from "@bessel/client";
import {
  bulkUpdateTransactionsMutation,
  categorizeByDescriptionMutation,
  createCategoryRuleMutation,
  deleteTransactionsMutation,
  listBankAccountsOptions,
  listBankAccountsQueryKey,
  listCategoriesOptions,
  listTransactionsOptions,
  listTransactionsQueryKey,
  unpairTransferMutation,
  updateTransactionMutation,
} from "@bessel/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@bessel/ui/components/alert-dialog";
import { Checkbox } from "@bessel/ui/components/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { Skeleton } from "@bessel/ui/components/skeleton";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowLeftRight, ChevronDown, Tag, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { BulkSuggestion } from "@/components/category-cell";
import { ImportDialog } from "@/components/import-dialog";
import {
  type TransactionFilters,
  TransactionFiltersBar,
} from "@/components/transaction-filters";
import { MonthSummary } from "@/components/transactions/month-summary";
import {
  type TransactionHandlers,
  TransactionList,
} from "@/components/transactions/transaction-list";
import { TransactionPanel } from "@/components/transactions/transaction-panel";
import {
  EmptyState,
  PageHeader,
  PeriodNav,
  placeholderKeys,
  SoftButton,
} from "@/components/ui-kit";
import { client } from "@/lib/client";
import { apiDate } from "@/lib/local-day";
import {
  mutationFamily,
  restoreItemFields,
  settleWhenIdle,
} from "@/lib/optimistic";
import { HideAmountsButton } from "@/lib/privacy";
import { useRouteFilters } from "@/lib/route-filters";
import { useKeptOpen } from "@/lib/use-kept-open";

// ─── Route + URL search params ────────────────────────────────────────────────

function parseFilters(raw: Record<string, unknown>): TransactionFilters {
  const asArr = (v: unknown): string[] | undefined => {
    if (Array.isArray(v))
      return v.filter((x): x is string => typeof x === "string");
    if (typeof v === "string") return [v];
    return undefined;
  };
  const asInt = (v: unknown): number | undefined => {
    const n =
      typeof v === "string"
        ? Number.parseInt(v, 10)
        : typeof v === "number"
          ? v
          : Number.NaN;
    return Number.isNaN(n) ? undefined : n;
  };
  return {
    bank_account_id: asArr(raw.bank_account_id),
    category_id: asArr(raw.category_id),
    uncategorized:
      raw.uncategorized === "true" || raw.uncategorized === true
        ? true
        : undefined,
    direction: typeof raw.direction === "string" ? raw.direction : undefined,
    is_business:
      raw.is_business === "true" || raw.is_business === true ? true : undefined,
    missing_documents:
      raw.missing_documents === "true" || raw.missing_documents === true
        ? true
        : undefined,
    search: typeof raw.search === "string" ? raw.search : undefined,
    transfers:
      raw.transfers === "hide" || raw.transfers === "only"
        ? raw.transfers
        : undefined,
    year: asInt(raw.year),
    month: asInt(raw.month),
  };
}

const transactionWrites = mutationFamily("transactions");

export const Route = createFileRoute("/_app/transactions")({
  validateSearch: (raw) => parseFilters(raw),
  component: Transactions,
});

const MONTH_LIMIT = 500;

// ─── Page ─────────────────────────────────────────────────────────────────────

function Transactions() {
  const now = new Date();
  // Filters live in the URL, so other pages can link straight to a filtered list.
  const [filters, setFilters] =
    useRouteFilters<TransactionFilters>("/transactions");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkSuggestion, setBulkSuggestion] = useState<BulkSuggestion | null>(
    null,
  );
  const queryClient = useQueryClient();

  const year = filters.year ?? now.getFullYear();
  const month = filters.month ?? now.getMonth() + 1;
  const firstDay = new Date(year, month - 1, 1);
  const mm = String(month).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayStr = `${year}-${mm}-01`;
  const lastDayStr = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;
  const dateFrom = useMemo(() => apiDate(firstDayStr), [firstDayStr]);
  const dateTo = useMemo(() => apiDate(lastDayStr), [lastDayStr]);
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  const navigateMonth = useCallback(
    (delta: -1 | 1) => {
      const newMonth = month + delta;
      const newYear = newMonth < 1 ? year - 1 : newMonth > 12 ? year + 1 : year;
      const clampedMonth = newMonth < 1 ? 12 : newMonth > 12 ? 1 : newMonth;
      const next: TransactionFilters = { year: newYear, month: clampedMonth };
      for (const [k, v] of Object.entries(filters)) {
        if (k === "year" || k === "month") continue;
        if (v === undefined || v === null) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        (next as Record<string, unknown>)[k] = v;
      }
      setFilters(next);
      setSelected(new Set());
    },
    [year, month, filters, setFilters],
  );

  const handleFiltersChange = useCallback(
    (next: TransactionFilters) => {
      const clean: TransactionFilters = { year, month };
      for (const [k, v] of Object.entries(next)) {
        if (k === "year" || k === "month") continue;
        if (v === undefined || v === null) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        (clean as Record<string, unknown>)[k] = v;
      }
      setFilters(clean);
      setSelected(new Set());
    },
    [year, month, setFilters],
  );

  // A search reaches across every month: "when did I last pay X?"
  const searching = !!filters.search;
  const summaryActions = useMemo(
    () => ({
      onPickMonth: (y: number, m: number) => {
        setFilters({ year: y, month: m });
        setSelected(new Set());
      },
      onPickCategory: (categoryId: string | null) =>
        handleFiltersChange(
          categoryId
            ? { category_id: [categoryId], transfers: "hide" }
            : { uncategorized: true, transfers: "hide" },
        ),
      onPickMerchant: (description: string) =>
        handleFiltersChange({ search: description }),
      onShowTransfers: () => handleFiltersChange({ transfers: "only" }),
    }),
    [setFilters, handleFiltersChange],
  );

  const { data, isLoading } = useQuery({
    ...listTransactionsOptions({
      client,
      query: {
        limit: MONTH_LIMIT,
        page: 1,
        sorting: ["-transaction_date", "description"],
        bank_account_id: filters.bank_account_id,
        category_id: filters.category_id,
        uncategorized: filters.uncategorized,
        direction: filters.direction,
        is_business: filters.is_business,
        missing_documents: filters.missing_documents,
        search: filters.search,
        transfers:
          filters.transfers === "only"
            ? true
            : filters.transfers === "hide"
              ? false
              : undefined,
        date_from: searching ? undefined : dateFrom,
        date_to: searching ? undefined : dateTo,
      },
    }),
    placeholderData: keepPreviousData,
  });

  const { data: categoriesData } = useQuery(
    listCategoriesOptions({
      client,
      query: { limit: 200 },
    }),
  );
  const categories = useMemo(
    () => categoriesData?.items ?? [],
    [categoriesData],
  );

  const { data: accountsData } = useQuery(
    listBankAccountsOptions({
      client,
      query: { limit: 100 },
    }),
  );
  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const acc of accountsData?.items ?? []) {
      map.set(acc.id, acc.name);
    }
    return map;
  }, [accountsData]);

  const queryKey = listTransactionsQueryKey({ client });
  const bankAccountsKey = listBankAccountsQueryKey({ client });

  const settle = () =>
    settleWhenIdle(queryClient, transactionWrites.mutationKey, () => {
      void queryClient.invalidateQueries({ queryKey });
    });
  const snapshot = async () => {
    await queryClient.cancelQueries({ queryKey });
    return queryClient.getQueriesData({ queryKey });
  };

  // A failed delete brings its rows back with the refetch in settle().
  const deleteMutation = useMutation({
    ...deleteTransactionsMutation({ client }),
    ...transactionWrites,
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({ queryKey });
      const idsToDelete = new Set(body.ids);
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.filter((t: any) => !idsToDelete.has(t.id)),
          pagination: {
            ...old.pagination,
            total_count: old.pagination.total_count - idsToDelete.size,
          },
        };
      });
      setSelected(new Set());
    },
    onError: () => toast.error("Failed to delete transactions"),
    onSettled: () => {
      settle();
      // Account balances are derived from their transactions.
      void queryClient.invalidateQueries({ queryKey: bankAccountsKey });
    },
  });

  const bulkUpdateMutation = useMutation({
    ...bulkUpdateTransactionsMutation({ client }),
    ...transactionWrites,
    onMutate: async ({ body }) => {
      const previous = await snapshot();
      const idSet = new Set(body.ids);
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((t: any) =>
            idSet.has(t.id) ? { ...t, category_id: body.category_id } : t,
          ),
        };
      });
      setSelected(new Set());
      return { previous, ids: idSet };
    },
    onError: (_err, _vars, context) => {
      restoreItemFields<TransactionSchema>(
        queryClient,
        context?.previous,
        context?.ids ?? new Set(),
        ["category_id"],
      );
      toast.error("Failed to categorize transactions");
    },
    onSettled: settle,
  });

  const bulkCategorizeMutation = useMutation({
    ...categorizeByDescriptionMutation({ client }),
    ...transactionWrites,
    onMutate: async ({ body }) => {
      const previous = await snapshot();
      const ids = new Set<string>();
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((t: any) => {
            if (t.description !== body.description) return t;
            ids.add(t.id);
            return { ...t, category_id: body.category_id };
          }),
        };
      });
      return { previous, ids };
    },
    onError: (_err, _vars, context) => {
      restoreItemFields<TransactionSchema>(
        queryClient,
        context?.previous,
        context?.ids ?? new Set(),
        ["category_id"],
      );
      toast.error("Failed to categorize transactions");
    },
    onSettled: () => {
      settle();
      setBulkSuggestion(null);
    },
  });

  const toggleBusinessMutation = useMutation({
    ...updateTransactionMutation({ client }),
    ...transactionWrites,
    onMutate: async ({ path, body }) => {
      const previous = await snapshot();
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((t: any) =>
            t.id === path.transaction_id
              ? { ...t, is_business: body.is_business }
              : t,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, { path }, context) => {
      restoreItemFields<TransactionSchema>(
        queryClient,
        context?.previous,
        new Set([path.transaction_id]),
        ["is_business"],
      );
      toast.error("Failed to update transaction");
    },
    onSettled: settle,
  });

  const handleToggleBusiness = useCallback(
    (id: string, value: boolean) => {
      toggleBusinessMutation.mutate({
        client,
        path: { transaction_id: id },
        body: { is_business: value },
      });
    },
    [toggleBusinessMutation.mutate],
  );

  const unpairMutation = useMutation({
    ...unpairTransferMutation({
      client,
    }),
    ...transactionWrites,
    onSuccess: () =>
      toast.success("Both sides count as income and spending again"),
    onError: () => toast.error("Couldn't unpair the transfer"),
    onSettled: settle,
  });

  const handleUnpair = useCallback(
    (id: string) => {
      unpairMutation.mutate({ client, path: { transaction_id: id } });
    },
    [unpairMutation.mutate],
  );

  const handleDeleteRows = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      deleteMutation.mutate({ body: { ids } });
    },
    [deleteMutation.mutate],
  );

  const handleBulkSuggestion = useCallback((info: BulkSuggestion) => {
    setBulkSuggestion(info);
  }, []);

  // Remembered as a rule, so later imports with the same text arrive sorted.
  const [rememberRule, setRememberRule] = useState(true);
  const createRuleMutation = useMutation({
    ...createCategoryRuleMutation({ client }),
    onSuccess: () =>
      toast.success("New ones like this will be sorted automatically"),
    onError: () => toast.error("Couldn't save the rule"),
  });

  const handleConfirmBulk = () => {
    if (!bulkSuggestion) return;
    bulkCategorizeMutation.mutate({
      client,
      body: {
        description: bulkSuggestion.description,
        category_id: bulkSuggestion.categoryId,
      },
    });
    if (rememberRule && bulkSuggestion.categoryId) {
      createRuleMutation.mutate({
        client,
        body: {
          category_id: bulkSuggestion.categoryId,
          pattern: bulkSuggestion.description,
          apply_now: false,
        },
      });
    }
  };

  const handlers: TransactionHandlers = useMemo(
    () => ({
      onOpen: (transaction) => setOpenId(transaction.id),
      onDelete: handleDeleteRows,
      onToggleBusiness: handleToggleBusiness,
      onUnpair: handleUnpair,
      onBulkSuggestion: handleBulkSuggestion,
    }),
    [
      handleBulkSuggestion,
      handleDeleteRows,
      handleToggleBusiness,
      handleUnpair,
    ],
  );

  const transactions = data?.items ?? [];
  const totalCount = data?.pagination.total_count ?? 0;
  const selectedCount = selected.size;
  const open = useKeptOpen(transactions, openId);
  const monthLabel = format(firstDay, "MMMM yyyy");
  const shown = Math.min(totalCount, MONTH_LIMIT);

  const list = (
    <div className="min-w-0 space-y-3">
      <TransactionFiltersBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        accounts={accountsData?.items ?? []}
        categories={categories}
      />

      {isLoading ? (
        <div className="space-y-1.5">
          {placeholderKeys(8).map((key) => (
            <Skeleton
              key={key}
              className="h-10 w-full rounded-lg bg-white/[0.06]"
            />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight />} title="No transactions">
          {Object.keys(filters).length > 0
            ? "No transactions match your current filters."
            : "Import a bank export to get started."}
        </EmptyState>
      ) : (
        <>
          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
              <span className="mr-auto text-12 tabular-nums text-white/55">
                {selectedCount} selected
              </span>

              {/* Bulk categorize */}
              <Popover>
                <PopoverTrigger asChild>
                  <SoftButton disabled={bulkUpdateMutation.isPending}>
                    <Tag />
                    Categorize
                    <ChevronDown className="text-white/45" />
                  </SoftButton>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="max-h-72 w-56 overflow-y-auto rounded-xl p-1.5"
                >
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left text-13 text-white/50 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/80"
                    onClick={() =>
                      bulkUpdateMutation.mutate({
                        client,
                        body: {
                          ids: [...selected],
                          category_id: null,
                        },
                      })
                    }
                  >
                    No category
                  </button>
                  {categories
                    .filter((c) => c.parent_id)
                    .map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className="flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-13 text-white/80 transition-colors duration-150 hover:bg-white/[0.06]"
                        onClick={() =>
                          bulkUpdateMutation.mutate({
                            client,
                            body: {
                              ids: [...selected],
                              category_id: cat.id,
                            },
                          })
                        }
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="truncate">{cat.name}</span>
                      </button>
                    ))}
                </PopoverContent>
              </Popover>

              <SoftButton
                onClick={() => handleDeleteRows([...selected])}
                disabled={deleteMutation.isPending}
                className="bg-red-500/10 text-red-400 hover:bg-red-500/15 hover:text-red-300"
              >
                <Trash2 />
                Delete
              </SoftButton>
            </div>
          )}

          <TransactionList
            transactions={transactions}
            accounts={accountMap}
            categories={categories}
            selected={selected}
            onSelectedChange={setSelected}
            handlers={handlers}
          />
        </>
      )}
    </div>
  );

  return (
    <div className="@container flex flex-col gap-4">
      <PageHeader
        title={searching ? "Search" : "Transactions"}
        summary={
          isLoading
            ? null
            : searching
              ? `${totalCount} match${totalCount !== 1 ? "es" : ""} for "${filters.search}" across all months${totalCount > shown ? `, newest ${shown} shown` : ""}`
              : `${totalCount} in ${format(firstDay, "MMMM")}`
        }
      >
        {!searching && (
          <PeriodNav
            label={monthLabel}
            onPrev={() => navigateMonth(-1)}
            onNext={() => navigateMonth(1)}
            nextDisabled={isCurrentMonth}
          />
        )}
        <HideAmountsButton />
        <ImportDialog />
      </PageHeader>

      {/* The summary covers all your own accounts, so it'd mislead next to one account's list. */}
      {!searching && !filters.bank_account_id?.length ? (
        <MonthSummary year={year} month={month} actions={summaryActions}>
          {list}
        </MonthSummary>
      ) : (
        list
      )}

      <TransactionPanel
        transaction={open}
        account={open ? accountMap.get(open.bank_account_id) : undefined}
        categories={categories}
        handlers={handlers}
        onOpenChange={(isOpen) => !isOpen && setOpenId(null)}
      />

      {/* Bulk categorize suggestion dialog */}
      <AlertDialog
        open={!!bulkSuggestion}
        onOpenChange={(open) => !open && setBulkSuggestion(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apply category to similar transactions?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkSuggestion?.count} other transaction
              {bulkSuggestion?.count !== 1 ? "s" : ""} with description &ldquo;
              {bulkSuggestion?.description}&rdquo; can be categorized as{" "}
              <strong>{bulkSuggestion?.categoryName}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkSuggestion?.categoryId && (
            <label className="flex items-center gap-2 text-13 text-white/70">
              <Checkbox
                checked={rememberRule}
                onCheckedChange={(checked) => setRememberRule(checked === true)}
              />
              Also sort new ones like this automatically
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>No thanks</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulk}
              disabled={bulkCategorizeMutation.isPending}
            >
              {bulkCategorizeMutation.isPending
                ? "Applying…"
                : `Apply to ${bulkSuggestion?.count} transaction${bulkSuggestion?.count !== 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

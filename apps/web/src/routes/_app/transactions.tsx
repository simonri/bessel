import type { TransactionSchema } from "@bessel/client";
import {
  bulkUpdateTransactionsV1TransactionsBulkPatchMutation,
  categorizeByDescriptionV1TransactionsCategorizeByDescriptionPostMutation,
  deleteTransactionsV1TransactionsDeleteMutation,
  listBankAccountsV1BankAccountsGetOptions,
  listBankAccountsV1BankAccountsGetQueryKey,
  listCategoriesV1CategoriesGetOptions,
  listTransactionsV1TransactionsGetOptions,
  listTransactionsV1TransactionsGetQueryKey,
  updateTransactionV1TransactionsTransactionIdPatchMutation,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
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
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { format, isToday, isYesterday } from "date-fns";
import {
  ArrowLeftRight,
  ChevronDown,
  MoreHorizontal,
  Tag,
  Trash2,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { type BulkSuggestion, CategoryCell } from "@/components/category-cell";
import { ImportDialog } from "@/components/import-dialog";
import {
  type TransactionFilters,
  TransactionFiltersBar,
} from "@/components/transaction-filters";
import {
  EmptyState,
  IconButton,
  PageToolbar,
  PeriodNav,
  SoftButton,
} from "@/components/ui-kit";
import { VirtualDataTable } from "@/components/virtual-data-table";
import { client } from "@/lib/client";
import { apiDate } from "@/lib/local-day";
import { formatAmount } from "@/lib/money";
import {
  mutationFamily,
  restoreItemFields,
  settleWhenIdle,
} from "@/lib/optimistic";

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
    return isNaN(n) ? undefined : n;
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
    search: typeof raw.search === "string" ? raw.search : undefined,
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

// ─── Date group label ─────────────────────────────────────────────────────────

function toLocalDateStr(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return format(d, "yyyy-MM-dd");
}

function getDateGroupLabel(
  tx: TransactionSchema,
  prev: TransactionSchema | undefined,
): string | null {
  const dateStr = toLocalDateStr(tx.transaction_date);
  const prevStr = prev ? toLocalDateStr(prev.transaction_date) : null;
  if (dateStr === prevStr) return null;

  const d = new Date(dateStr + "T00:00:00");
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, MMM d");
}

// ─── Actions cell ─────────────────────────────────────────────────────────────

const TransactionActions = memo(function TransactionActions({
  id,
  isBusiness,
  onDelete,
  onToggleBusiness,
}: {
  id: string;
  isBusiness: boolean;
  onDelete: (ids: string[]) => void;
  onToggleBusiness: (id: string, value: boolean) => void;
}) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label="Open menu">
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onToggleBusiness(id, !isBusiness)}>
            {isBusiness
              ? "Remove business expense"
              : "Mark as business expense"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
            onClick={() => onDelete([id])}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

// ─── Page ─────────────────────────────────────────────────────────────────────

function Transactions() {
  const now = new Date();
  const [filters, setFilters] = useState<TransactionFilters>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
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
      setRowSelection({});
    },
    [year, month, filters],
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
      setRowSelection({});
    },
    [year, month],
  );

  const { data, isLoading } = useQuery({
    ...listTransactionsV1TransactionsGetOptions({
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
        search: filters.search,
        date_from: dateFrom,
        date_to: dateTo,
      },
    }),
    placeholderData: keepPreviousData,
  });

  const { data: categoriesData } = useQuery(
    listCategoriesV1CategoriesGetOptions({
      client,
      query: { limit: 200 },
    }),
  );
  const categories = useMemo(
    () => categoriesData?.items ?? [],
    [categoriesData],
  );

  const { data: accountsData } = useQuery(
    listBankAccountsV1BankAccountsGetOptions({
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

  const queryKey = listTransactionsV1TransactionsGetQueryKey({ client });
  const bankAccountsKey = listBankAccountsV1BankAccountsGetQueryKey({ client });

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
    ...deleteTransactionsV1TransactionsDeleteMutation({ client }),
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
      setRowSelection({});
    },
    onError: () => toast.error("Failed to delete transactions"),
    onSettled: () => {
      settle();
      // Account balances are derived from their transactions.
      void queryClient.invalidateQueries({ queryKey: bankAccountsKey });
    },
  });

  const bulkUpdateMutation = useMutation({
    ...bulkUpdateTransactionsV1TransactionsBulkPatchMutation({ client }),
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
      setRowSelection({});
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
    ...categorizeByDescriptionV1TransactionsCategorizeByDescriptionPostMutation(
      { client },
    ),
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
    ...updateTransactionV1TransactionsTransactionIdPatchMutation({ client }),
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

  const handleConfirmBulk = () => {
    if (!bulkSuggestion) return;
    bulkCategorizeMutation.mutate({
      client,
      body: {
        description: bulkSuggestion.description,
        category_id: bulkSuggestion.categoryId,
      },
    });
  };

  // Stable columns identity — a fresh array (with fresh cell closures) every
  // render forces react-table to rebuild its column model per keystroke in
  // the filters and re-render every cell.
  const columns: ColumnDef<TransactionSchema>[] = useMemo(
    () => [
      {
        id: "select",
        size: 40,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-13 text-white/85">
              {row.original.description ?? "—"}
            </span>
            {row.original.is_business && (
              <span className="inline-flex shrink-0 items-center rounded-md border border-primary-500/25 bg-primary-500/10 px-1.5 py-px text-10 font-semibold text-primary-300">
                Business
              </span>
            )}
          </div>
        ),
      },
      {
        id: "account",
        size: 120,
        header: "Account",
        // hidden on mobile via meta — handled by className on TableCell below
        cell: ({ row }) => (
          <span className="hidden truncate text-12 text-white/45 sm:block">
            {accountMap.get(row.original.bank_account_id) ?? "—"}
          </span>
        ),
      },
      {
        id: "category",
        size: 160,
        header: "Category",
        cell: ({ row }) => (
          <CategoryCell
            transactionId={row.original.id}
            categoryId={row.original.category_id}
            description={row.original.description}
            categories={categories}
            onBulkSuggestion={handleBulkSuggestion}
          />
        ),
      },
      {
        accessorKey: "amount",
        size: 120,
        header: () => <div className="text-right">Amount</div>,
        cell: ({ row }) => {
          const amount = row.original.amount;
          const sign = row.original.direction === "debit" ? "−" : "+";
          return (
            <div
              className={`text-right text-13 font-medium tabular-nums ${
                row.original.direction === "credit"
                  ? "text-income"
                  : "text-white/80"
              }`}
            >
              {sign}
              {formatAmount(amount)}
            </div>
          );
        },
      },
      {
        id: "actions",
        size: 48,
        header: () => null,
        cell: ({ row }) => (
          <div className="hidden sm:block">
            <TransactionActions
              id={row.original.id}
              isBusiness={row.original.is_business ?? false}
              onDelete={handleDeleteRows}
              onToggleBusiness={handleToggleBusiness}
            />
          </div>
        ),
      },
    ],
    [
      accountMap,
      categories,
      handleBulkSuggestion,
      handleDeleteRows,
      handleToggleBusiness,
    ],
  );

  const transactions = data?.items ?? [];
  const totalCount = data?.pagination.total_count ?? 0;
  const selectedCount = Object.keys(rowSelection).length;
  const monthLabel = format(firstDay, "MMMM yyyy");

  return (
    <div className="flex flex-col gap-4">
      <PageToolbar
        description={
          isLoading
            ? "Loading…"
            : `${totalCount} transaction${totalCount !== 1 ? "s" : ""}`
        }
      >
        <PeriodNav
          label={monthLabel}
          onPrev={() => navigateMonth(-1)}
          onNext={() => navigateMonth(1)}
          nextDisabled={isCurrentMonth}
        />
        <ImportDialog />
      </PageToolbar>

      <TransactionFiltersBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        accounts={accountsData?.items ?? []}
        categories={categories}
      />

      {/* Table */}
      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
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
                {selectedCount} row{selectedCount !== 1 ? "s" : ""} selected
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
                          ids: Object.keys(rowSelection),
                          category_id: null,
                        },
                      })
                    }
                  >
                    None (clear)
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
                              ids: Object.keys(rowSelection),
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
                onClick={() => handleDeleteRows(Object.keys(rowSelection))}
                disabled={deleteMutation.isPending}
                className="bg-red-500/10 text-red-400 hover:bg-red-500/15 hover:text-red-300"
              >
                <Trash2 />
                Delete
              </SoftButton>
            </div>
          )}

          <VirtualDataTable
            columns={columns}
            data={transactions}
            getRowId={(row) => row.id}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            getGroupLabel={getDateGroupLabel}
          />
        </>
      )}

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

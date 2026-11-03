import type { TagSummary, TransactionSchema } from "@bessel/client";
import {
  listTransactionsOptions,
  listTransactionsQueryKey,
  listTransactionTagsOptions,
  listTransactionTagsQueryKey,
  tagTransactionsMutation,
  updateTransactionMutation,
} from "@bessel/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import {
  type MutationFunction,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { CheckCheck, Hash } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Tag, TagInput } from "@/components/tag-input";
import { Panel, SoftButton } from "@/components/ui-kit";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import {
  mutationFamily,
  restoreItemFields,
  settleWhenIdle,
} from "@/lib/optimistic";
import { Amount } from "@/lib/privacy";

const MAX_LENGTH = 50;
const transactionWrites = mutationFamily("transactions");

/** A tag as the server keeps it: single spaces, the case as typed. */
export function tidyTag(tag: string): string {
  return tag.trim().split(/\s+/).join(" ").slice(0, MAX_LENGTH);
}

/** `tags` without `remove` (any case) and with `add`, each once. */
export function retag(
  tags: readonly string[],
  add: readonly string[],
  remove: readonly string[] = [],
): string[] {
  const removed = new Set(remove.map((t) => t.toLowerCase()));
  const kept = new Map<string, string>();
  for (const tag of [
    ...tags.filter((t) => !removed.has(t.toLowerCase())),
    ...add,
  ]) {
    if (!kept.has(tag.toLowerCase())) kept.set(tag.toLowerCase(), tag);
  }
  return [...kept.values()];
}

/** The user's tags, most used first. */
export function useTagNames(): string[] {
  const { data } = useQuery(listTransactionTagsOptions({ client }));
  return useMemo(() => data?.items.map((t) => t.tag) ?? [], [data]);
}

/** How many transactions still wait to be reviewed, across every month. */
export function useToReviewCount(): number | undefined {
  const { data } = useQuery(
    listTransactionsOptions({
      client,
      query: { to_review: true, limit: 1, page: 1 },
    }),
  );
  return data?.pagination.total_count;
}

const listKey = () => listTransactionsQueryKey({ client });

function setTags(
  queryClient: QueryClient,
  change: (transaction: TransactionSchema) => string[] | null,
) {
  queryClient.setQueriesData({ queryKey: listKey() }, (old: any) =>
    old?.items
      ? {
          ...old,
          items: old.items.map((t: TransactionSchema) => {
            const tags = change(t);
            return tags ? { ...t, tags } : t;
          }),
        }
      : old,
  );
}

function useTagWrite<D, V>(
  mutation: { mutationFn?: MutationFunction<D, V> },
  optimistic: (variables: V) => {
    ids: Set<string>;
    change: (t: TransactionSchema) => string[] | null;
  },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mutation.mutationFn,
    ...transactionWrites,
    meta: { errorToast: false },
    onMutate: async (variables: V) => {
      await queryClient.cancelQueries({ queryKey: listKey() });
      const previous = queryClient.getQueriesData({ queryKey: listKey() });
      const { ids, change } = optimistic(variables);
      setTags(queryClient, (t) => (ids.has(t.id) ? change(t) : null));
      return { previous, ids };
    },
    onError: (error, _variables, context) => {
      restoreItemFields<TransactionSchema>(
        queryClient,
        context?.previous,
        context?.ids ?? new Set(),
        ["tags"],
      );
      toast.error(errorDetail(error, "Couldn't save the tags"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: listTransactionTagsQueryKey({ client }),
      });
      settleWhenIdle(queryClient, transactionWrites.mutationKey, () => {
        void queryClient.invalidateQueries({ queryKey: listKey() });
      });
    },
  });
}

/** The panel's tags: chips with an editor that offers the user's own tags as you type. */
export function TagsField({ transaction }: { transaction: TransactionSchema }) {
  const names = useTagNames();
  const update = useTagWrite(updateTransactionMutation({ client }), (v) => ({
    ids: new Set([v.path.transaction_id]),
    change: () => v.body.tags ?? null,
  }));
  return (
    <div>
      <span className="mb-1.5 block type-section text-white/55">Tags</span>
      <TagInput
        tags={transaction.tags ?? []}
        suggestions={names}
        normalize={tidyTag}
        placeholder="A trip, a project, ask the accountant..."
        onChange={(tags) =>
          update.mutate({
            client,
            path: { transaction_id: transaction.id },
            body: { tags },
          })
        }
      />
    </div>
  );
}

/** A row's tags, the first few and how many more. */
export function TagChips({
  tags,
  max = 2,
}: {
  tags: readonly string[] | undefined;
  max?: number;
}) {
  if (!tags?.length) return null;
  const more = tags.length - max;
  return (
    <span className="flex min-w-0 shrink items-center gap-1 overflow-hidden">
      {tags.slice(0, max).map((tag) => (
        <Tag key={tag} tag={tag} />
      ))}
      {more > 0 && <span className="type-caption text-white/40">+{more}</span>}
    </span>
  );
}

/** Tag several at once: add tags to all of them, or take off one they have. */
export function BulkTags({
  transactions,
  disabled,
}: {
  transactions: TransactionSchema[];
  disabled?: boolean;
}) {
  const names = useTagNames();
  const [adding, setAdding] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const write = useTagWrite(tagTransactionsMutation({ client }), (v) => ({
    ids: new Set(v.body.ids),
    change: (t) => retag(t.tags ?? [], v.body.add ?? [], v.body.remove ?? []),
  }));
  const ids = transactions.map((t) => t.id);
  const present = retag(
    [],
    transactions.flatMap((t) => t.tags ?? []),
  );
  const count = transactions.length;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAdding([]);
      }}
    >
      <PopoverTrigger asChild>
        <SoftButton disabled={disabled}>
          <Hash />
          Tag
        </SoftButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 rounded-xl p-3">
        <div className="space-y-2">
          <TagInput
            tags={adding}
            onChange={setAdding}
            suggestions={names}
            normalize={tidyTag}
            placeholder="Add a tag"
          />
          <SoftButton
            disabled={adding.length === 0}
            onClick={() => {
              write.mutate({ client, body: { ids, add: adding } });
              setOpen(false);
              setAdding([]);
            }}
          >
            Add to {count} transaction{count === 1 ? "" : "s"}
          </SoftButton>
        </div>
        {present.length > 0 && (
          <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
            <p className="type-caption text-white/45">Take off</p>
            <div className="flex flex-wrap gap-1">
              {present.map((tag) => (
                <Tag
                  key={tag}
                  tag={tag}
                  onRemove={() =>
                    write.mutate({ client, body: { ids, remove: [tag] } })
                  }
                />
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Totals({ summary }: { summary: TagSummary }) {
  return (
    <span className="flex flex-col items-end">
      {summary.totals.map((total) => (
        <span key={total.currency} className="text-13 text-white/80">
          <Amount value={total.spent} currency={total.currency} />
          {total.received > 0 && (
            <span className="ml-1.5 type-caption text-income">
              +<Amount value={total.received} currency={total.currency} />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/** What went out under each tag in the period, per currency; picking one lists it. */
export function TagTotals({
  dateFrom,
  dateTo,
  onPickTag,
}: {
  dateFrom: Date;
  dateTo: Date;
  onPickTag: (tag: string) => void;
}) {
  const { data } = useQuery(
    listTransactionTagsOptions({
      client,
      query: { date_from: dateFrom, date_to: dateTo },
    }),
  );
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Panel className="divide-y-0 p-5">
      <p className="type-label text-white/55">Tags</p>
      <p className="mb-2 type-caption text-white/40">
        Everything tagged this month, company money too
      </p>
      <ul className="-mx-2">
        {items.map((summary) => (
          <li key={summary.tag}>
            <button
              type="button"
              onClick={() => onPickTag(summary.tag)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/[0.05]"
            >
              <span className="min-w-0">
                <Tag tag={summary.tag} />
                <span className="ml-1.5 type-caption text-white/35">
                  {summary.count}
                </span>
              </span>
              <Totals summary={summary} />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** For a tag's own list: what went out and came in under it, across every month. */
export function TagFilterSummary({ tags }: { tags: readonly string[] }) {
  const { data } = useQuery(listTransactionTagsOptions({ client }));
  const picked = (data?.items ?? []).filter((s) => tags.includes(s.tag));
  if (picked.length === 0) return null;
  return (
    <Panel className="divide-y-0 px-5 py-3">
      <ul className="space-y-1.5">
        {picked.map((summary) => (
          <li
            key={summary.tag}
            className="flex items-center justify-between gap-3"
          >
            <span className="min-w-0">
              <Tag tag={summary.tag} />
              <span className="ml-1.5 type-caption text-white/40">
                {summary.count} transaction{summary.count === 1 ? "" : "s"} in
                all, moves between your accounts left out
              </span>
            </span>
            <Totals summary={summary} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Imports arrive unreviewed: how many wait, with the way to go through them. */
export function ToReview({
  count,
  onReview,
}: {
  count: number;
  onReview: () => void;
}) {
  return (
    <Panel className="flex items-center gap-3 divide-y-0 p-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-primary-300">
        <CheckCheck className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-13 font-medium text-white/85">{count} to review</p>
        <p className="type-caption text-white/45">
          New imports, across every month.
        </p>
      </div>
      <SoftButton onClick={onReview}>Review</SoftButton>
    </Panel>
  );
}

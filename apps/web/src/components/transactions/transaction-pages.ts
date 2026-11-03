import {
  type ListTransactionsData,
  listTransactions,
  type TransactionListResponse,
} from "@bessel/client";
import { client } from "@/lib/client";

/** The most the API sends in one page. */
export const PAGE_SIZE = 100;

type Query = Omit<NonNullable<ListTransactionsData["query"]>, "page" | "limit">;

/** Every transaction the query matches, up to `max`, fetched a page at a
 *  time: one page alone would cut a busy month short. */
export async function listTransactionPages(
  query: Query,
  {
    max = Number.POSITIVE_INFINITY,
    signal,
  }: { max?: number; signal?: AbortSignal } = {},
): Promise<TransactionListResponse> {
  const items: TransactionListResponse["items"] = [];
  for (let page = 1; ; page++) {
    const { data } = await listTransactions({
      client,
      query: { ...query, limit: PAGE_SIZE, page },
      signal,
      throwOnError: true,
    });
    items.push(...data.items);
    if (page >= data.pagination.max_page || items.length >= max) {
      return {
        items: items.slice(0, max),
        pagination: { total_count: data.pagination.total_count, max_page: 1 },
      };
    }
  }
}

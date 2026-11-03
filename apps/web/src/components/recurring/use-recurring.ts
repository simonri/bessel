import type {
  ListRecurringPaymentsResponse,
  RecurringDecision,
  RecurringKind,
  RecurringSeriesSchema,
} from "@bessel/client";
import {
  createRecurringReview,
  deleteRecurringReview,
  listRecurringPaymentsOptions,
  listRecurringPaymentsQueryKey,
  updateRecurringReview,
} from "@bessel/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/lib/client";

export const UPCOMING_DAYS = 30;

export function useRecurring(days = UPCOMING_DAYS) {
  return useQuery(listRecurringPaymentsOptions({ client, query: { days } }));
}

export interface ReviewChange {
  decision?: RecurringDecision | null;
  name?: string | null;
  kind?: RecurringKind | null;
}

/** A change to a series, or `null` to forget the user's review and go back to what was detected. */
export type Review = ReviewChange | null;

async function send(series: RecurringSeriesSchema, review: Review) {
  if (review === null) {
    if (series.review_id)
      await deleteRecurringReview({
        client,
        path: { review_id: series.review_id },
        throwOnError: true,
      });
    return;
  }
  if (series.review_id) {
    await updateRecurringReview({
      client,
      path: { review_id: series.review_id },
      body: review,
      throwOnError: true,
    });
    return;
  }
  await createRecurringReview({
    client,
    body: {
      key: series.key,
      typical_amount: series.typical_amount,
      ...review,
    },
    throwOnError: true,
  });
}

function applied(
  series: RecurringSeriesSchema,
  review: Review,
): RecurringSeriesSchema {
  if (review === null)
    return {
      ...series,
      decision: null,
      name: series.detected_name,
    };
  return {
    ...series,
    ...(review.decision !== undefined && { decision: review.decision }),
    ...(review.name !== undefined && {
      name: review.name ?? series.detected_name,
    }),
    ...(review.kind != null && { kind: review.kind }),
  };
}

/** Confirms, dismisses, renames or re-kinds a series, shown at once and kept on the server. */
export function useReviewSeries() {
  const queryClient = useQueryClient();
  const queryKey = listRecurringPaymentsQueryKey({ client });
  const mutation = useMutation({
    mutationFn: ({
      series,
      review,
    }: {
      series: RecurringSeriesSchema;
      review: Review;
    }) => send(series, review),
    onMutate: async ({ series, review }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData<ListRecurringPaymentsResponse>(
        { queryKey },
        (old) =>
          old && {
            ...old,
            series: old.series.map((s) =>
              s.key === series.key && s.typical_amount === series.typical_amount
                ? applied(s, review)
                : s,
            ),
          },
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.previous ?? [])
        queryClient.setQueryData(key, data);
      toast.error("Couldn't save that change");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  return (series: RecurringSeriesSchema, review: Review) =>
    mutation.mutate({ series, review });
}

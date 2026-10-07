import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
  errorDetail,
  errorStatus,
  isApiError,
  shouldRetryQuery,
} from "@/lib/api-error";
import { captureException } from "@/lib/sentry";

/** Server faults and requests the API rejected as malformed point at a bug
 *  rather than at the user or the network. */
function isReportable(status: number | undefined): boolean {
  return status !== undefined && (status >= 500 || status === 422);
}

export function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        const status = errorStatus(error);
        if (!isReportable(status)) return;
        const queryKey = JSON.stringify(query.queryKey);
        console.error(`Query failed with ${status}`, queryKey, error);
        captureException(new Error(`Query failed with ${status}`), {
          queryKey,
          body: error,
        });
      },
    }),
    mutationCache: new MutationCache({
      // Mutations that handle their own errors set onError, or opt out with
      // `meta: { errorToast: false }` when the caller does it per call.
      onError: (error, _variables, _context, mutation) => {
        if (mutation.options.onError) return;
        if (mutation.meta?.errorToast === false) return;
        if (!isApiError(error)) return;
        toast.error(errorDetail(error, "Something went wrong"));
      },
    }),
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        // Consider data stale after 30 seconds
        staleTime: 30 * 1000,
        // A desktop shell gains/loses focus constantly — refetching every
        // stale query app-wide on each alt-tab is a refetch storm. Queries
        // that genuinely want it (e.g. git status) opt back in.
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

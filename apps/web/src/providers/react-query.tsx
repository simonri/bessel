import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retry once on failure, useful for transient errors
        retry: 1,
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

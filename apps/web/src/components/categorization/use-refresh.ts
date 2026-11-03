import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

// Generated query keys start with `{ _id: <operation id> }`.
const AFFECTED = new Set([
  "listCategories",
  "listCategoryRules",
  "listTransactions",
  "getTransactionSummary",
]);

/** After a rule or category changes: transactions may have moved, and every count with them. */
export function useRefreshCategorization() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({
      predicate: (query) =>
        AFFECTED.has(
          (query.queryKey[0] as { _id?: string } | undefined)?._id ?? "",
        ),
    });
  }, [queryClient]);
}

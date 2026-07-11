import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updateTransactionV1TransactionsTransactionIdPatchMutation,
  listTransactionsV1TransactionsGetQueryKey,
} from "@bessel/client";
import { toast } from "sonner";
import { client } from "@/lib/client";

interface BusinessCellProps {
  transactionId: string;
  isBusiness: boolean;
}

export function BusinessCell({ transactionId, isBusiness }: BusinessCellProps) {
  const queryClient = useQueryClient();
  const queryKey = listTransactionsV1TransactionsGetQueryKey({ client });

  const mutation = useMutation({
    ...updateTransactionV1TransactionsTransactionIdPatchMutation({ client }),
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((t: any) =>
            t.id === transactionId ? { ...t, is_business: body.is_business } : t,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) queryClient.setQueryData(key, data);
      }
      toast.error("Failed to update transaction");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const toggle = () => {
    mutation.mutate({
      client,
      path: { transaction_id: transactionId },
      body: { is_business: !isBusiness },
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={mutation.isPending}
      title={isBusiness ? "Mark as personal" : "Mark as business"}
      className="flex w-full items-center justify-center disabled:opacity-50"
    >
      {isBusiness ? (
        <span className="text-xs text-muted-foreground font-medium">Biz</span>
      ) : (
        <span className="text-xs text-foreground/10 hover:text-foreground/30 transition-colors">·</span>
      )}
    </button>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CategorySchema } from "@metron/client";
import {
  updateTransactionV1TransactionsTransactionIdPatchMutation,
  listTransactionsV1TransactionsGetQueryKey,
} from "@metron/client";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxEmpty,
} from "@metron/ui/components/combobox";
import { client } from "@/lib/client";

interface CategoryCellProps {
  transactionId: string;
  categoryId: string | null;
  categories: CategorySchema[];
}

function useGroupedCategories(categories: CategorySchema[]) {
  return useMemo(() => {
    const parents = categories.filter((c) => !c.parent_id);
    const childrenMap = new Map<string, CategorySchema[]>();
    for (const cat of categories) {
      if (cat.parent_id) {
        const list = childrenMap.get(cat.parent_id) ?? [];
        list.push(cat);
        childrenMap.set(cat.parent_id, list);
      }
    }
    return parents.map((p) => ({
      parent: p,
      children: childrenMap.get(p.id) ?? [],
    }));
  }, [categories]);
}

export function CategoryCell({
  transactionId,
  categoryId,
  categories,
}: CategoryCellProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const grouped = useGroupedCategories(categories);

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
            t.id === transactionId
              ? { ...t, category_id: body.category_id }
              : t,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const currentCategory = categories.find((c) => c.id === categoryId);

  const handleSelect = (value: string | null) => {
    const newCategoryId = value || null;
    if (newCategoryId === categoryId) {
      setOpen(false);
      return;
    }

    mutation.mutate({
      client,
      path: { transaction_id: transactionId },
      body: { category_id: newCategoryId },
    });
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-sm hover:bg-accent transition-colors"
      >
        {currentCategory ? (
          <>
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: currentCategory.color }}
            />
            <span className="truncate max-w-[120px]">{currentCategory.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </button>
    );
  }

  return (
    <Combobox
      open={open}
      onOpenChange={setOpen}
      value={categoryId ?? ""}
      onValueChange={(val) => handleSelect(val as string | null)}
    >
      <ComboboxInput
        placeholder="Search..."
        className="h-7 w-[160px] text-sm"
        autoFocus
        showClear={!!categoryId}
      />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>No categories found</ComboboxEmpty>
          {grouped.map(({ parent, children }) => (
            <ComboboxGroup key={parent.id}>
              <ComboboxLabel>{parent.name}</ComboboxLabel>
              {children.map((cat) => (
                <ComboboxItem key={cat.id} value={cat.id} textValue={cat.name}>
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.name}
                </ComboboxItem>
              ))}
            </ComboboxGroup>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

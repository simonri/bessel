import { useRef, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CategorySchema } from "@bessel/client";
import {
  updateTransactionV1TransactionsTransactionIdPatchMutation,
  listTransactionsV1TransactionsGetQueryKey,
} from "@bessel/client";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
} from "@bessel/ui/components/combobox";
import { toast } from "sonner";
import { client } from "@/lib/client";

export interface BulkSuggestion {
  description: string;
  categoryId: string;
  categoryName: string;
  count: number;
}

interface CategoryCellProps {
  transactionId: string;
  categoryId: string | null;
  description: string | null;
  categories: CategorySchema[];
  onBulkSuggestion?: (info: BulkSuggestion) => void;
}

interface GroupedCategory {
  parent: CategorySchema;
  children: CategorySchema[];
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
    return parents
      .map((p) => ({
        parent: p,
        children: childrenMap.get(p.id) ?? [],
      }))
      .filter((g) => g.children.length > 0);
  }, [categories]);
}

function filterGroups(groups: GroupedCategory[], query: string): GroupedCategory[] {
  if (!query) return groups;
  const q = query.toLowerCase();
  return groups
    .map((g) => ({
      ...g,
      children: g.children.filter((c) => c.name.toLowerCase().includes(q)),
    }))
    .filter((g) => g.children.length > 0);
}

export function CategoryCell({
  transactionId,
  categoryId,
  description,
  categories,
  onBulkSuggestion,
}: CategoryCellProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const grouped = useGroupedCategories(categories);
  const filtered = useMemo(() => filterGroups(grouped, search), [grouped, search]);

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
            t.id === transactionId ? { ...t, category_id: body.category_id } : t,
          ),
        };
      });
      return { previous };
    },
    onSuccess: (data) => {
      if (
        data.same_description_count &&
        data.same_description_count > 0 &&
        data.category_id &&
        description &&
        onBulkSuggestion
      ) {
        const cat = categories.find((c) => c.id === data.category_id);
        onBulkSuggestion({
          description,
          categoryId: data.category_id,
          categoryName: cat?.name ?? "Unknown",
          count: data.same_description_count,
        });
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Failed to update category");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const currentCategory = categories.find((c) => c.id === categoryId);

  const handleSelect = (value: string | null) => {
    const newCategoryId = value || null;
    if (newCategoryId === categoryId) {
      setOpen(false);
      setSearch("");
      return;
    }

    mutation.mutate({
      client,
      path: { transaction_id: transactionId },
      body: { category_id: newCategoryId },
    });
    setOpen(false);
    setSearch("");
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
    <div ref={containerRef}>
      <Combobox
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && containerRef.current?.contains(document.activeElement)) {
            return;
          }
          setOpen(nextOpen);
          if (!nextOpen) setSearch("");
        }}
        value={categoryId ?? ""}
        onValueChange={(val) => handleSelect(val as string | null)}
        filter={null}
        inputValue={search}
        onInputValueChange={(val) => setSearch(val)}
      >
        <ComboboxInput
          placeholder="Search..."
          className="h-7 w-[160px] text-sm"
          autoFocus
          showTrigger={false}
        />
        <ComboboxContent className="min-w-[220px]">
          <ComboboxList>
            {filtered.length === 0 ? (
              <div className="text-muted-foreground py-2 text-center text-sm">
                No categories found
              </div>
            ) : (
              <>
                {categoryId && !search && (
                  <ComboboxItem value="">
                    <span className="text-muted-foreground">None</span>
                  </ComboboxItem>
                )}
                {filtered.map(({ parent, children }) => (
                  <ComboboxGroup key={parent.id}>
                    <ComboboxLabel>{parent.name}</ComboboxLabel>
                    {children.map((cat) => (
                      <ComboboxItem key={cat.id} value={cat.id}>
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.name}
                      </ComboboxItem>
                    ))}
                  </ComboboxGroup>
                ))}
              </>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

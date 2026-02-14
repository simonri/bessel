import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import type { CategorySchema } from "@metron/client";
import {
  listCategoriesV1CategoriesGetOptions,
  listCategoriesV1CategoriesGetQueryKey,
  deleteCategoryV1CategoriesCategoryIdDeleteMutation,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";
import { DataTable } from "@/components/data-table";
import { CreateCategoryDialog } from "@/components/create-category-dialog";
import { EditCategoryDialog } from "@/components/edit-category-dialog";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/categories")({
  component: Categories,
});

function Categories() {
  const [page, setPage] = useState(1);
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...listCategoriesV1CategoriesGetOptions({
      client,
      query: {
        page,
        limit,
        sorting: ["name"],
      },
    }),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    ...deleteCategoryV1CategoriesCategoryIdDeleteMutation({ client }),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: listCategoriesV1CategoriesGetQueryKey({ client }),
      });
    },
  });

  const columns: ColumnDef<CategorySchema>[] = [
    {
      accessorKey: "color",
      size: 60,
      header: "Color",
      cell: ({ row }) => (
        <div
          className="size-5 rounded-full"
          style={{ backgroundColor: row.original.color }}
        />
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      id: "actions",
      size: 100,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <EditCategoryDialog category={row.original} />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive"
            onClick={() =>
              deleteMutation.mutate({
                client,
                path: { category_id: row.original.id },
              })
            }
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  const categories = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;
  const totalCount = data?.pagination.total_count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
          {totalCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {totalCount} categor{totalCount !== 1 ? "ies" : "y"}
            </p>
          )}
        </div>
        <CreateCategoryDialog />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground flex h-24 items-center justify-center">
          Loading...
        </div>
      ) : (
        <>
          <div className={isPlaceholderData ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <DataTable columns={columns} data={categories} />
          </div>

          {maxPage > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isPlaceholderData}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page} of {maxPage}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                disabled={page >= maxPage || isPlaceholderData}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

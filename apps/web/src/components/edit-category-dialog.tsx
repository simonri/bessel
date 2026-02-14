import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { Button } from "@metron/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metron/ui/components/dialog";
import { Input } from "@metron/ui/components/input";
import { Label } from "@metron/ui/components/label";
import type { CategorySchema } from "@metron/client";
import {
  updateCategoryV1CategoriesCategoryIdPatchMutation,
  listCategoriesV1CategoriesGetQueryKey,
} from "@metron/client";
import { client } from "@/lib/client";

export function EditCategoryDialog({ category }: { category: CategorySchema }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    ...updateCategoryV1CategoriesCategoryIdPatchMutation({ client }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: listCategoriesV1CategoriesGetQueryKey({ client }),
      });
      setOpen(false);
    },
  });

  const handleOpen = () => {
    setName(category.name);
    setColor(category.color);
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    mutation.mutate({
      client,
      path: { category_id: category.id },
      body: { name, color },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? handleOpen() : setOpen(false))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Category</DialogTitle>
          <DialogDescription>
            Update the category details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-category-name">Name</Label>
            <Input
              id="edit-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-category-color">Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="edit-category-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border p-1"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                maxLength={7}
                className="flex-1"
              />
            </div>
          </div>

          {mutation.isError && (
            <p className="text-destructive text-sm">
              Failed to update category. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !name}>
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

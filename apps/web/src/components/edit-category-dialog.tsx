import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
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

  const form = useForm({
    defaultValues: {
      name: category.name,
      color: category.color,
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        client,
        path: { category_id: category.id },
        body: { name: value.name, color: value.color },
      });
    },
  });

  const handleOpen = () => {
    form.reset({
      name: category.name,
      color: category.color,
    });
    setOpen(true);
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field
            name="name"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-category-name">Name</Label>
                <Input
                  id="edit-category-name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  required
                />
              </div>
            )}
          />

          <form.Field
            name="color"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-category-color">Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="edit-category-color"
                    type="color"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border p-1"
                  />
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    maxLength={7}
                    className="flex-1"
                  />
                </div>
              </div>
            )}
          />

          {mutation.isError && (
            <p className="text-destructive text-sm">
              Failed to update category. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.values.name] as const}
              children={([name]) => (
                <Button type="submit" disabled={mutation.isPending || !name}>
                  {mutation.isPending ? "Saving..." : "Save"}
                </Button>
              )}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Plus } from "lucide-react";
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
import {
  createCategoryV1CategoriesPostMutation,
  listCategoriesV1CategoriesGetQueryKey,
} from "@metron/client";
import { client } from "@/lib/client";

export function CreateCategoryDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    ...createCategoryV1CategoriesPostMutation({ client }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: listCategoriesV1CategoriesGetQueryKey({ client }),
      });
      handleClose();
    },
  });

  const form = useForm({
    defaultValues: {
      name: "",
      color: "#6B7280",
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        client,
        body: { name: value.name, color: value.color },
      });
    },
  });

  const handleClose = () => {
    setOpen(false);
    form.reset();
    mutation.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Category
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Category</DialogTitle>
          <DialogDescription>
            Add a new category to organize transactions.
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
                <Label htmlFor="category-name">Name</Label>
                <Input
                  id="category-name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. Groceries"
                  required
                />
              </div>
            )}
          />

          <form.Field
            name="color"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="category-color">Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="category-color"
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
              Failed to create category. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.values.name] as const}
              children={([name]) => (
                <Button type="submit" disabled={mutation.isPending || !name}>
                  {mutation.isPending ? "Creating..." : "Create"}
                </Button>
              )}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

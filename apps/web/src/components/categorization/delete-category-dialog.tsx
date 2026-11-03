import type { CategorySchema } from "@bessel/client";
import { deleteCategoryMutation } from "@bessel/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@bessel/ui/components/alert-dialog";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import { moveTargets, plural } from "./categorization";
import { CategoryPicker } from "./category-picker";
import { useRefreshCategorization } from "./use-refresh";

type Choice = "move" | "uncategorize";

/** What happens to a category's transactions and rules is always the user's call, never a silent default. */
export function DeleteCategoryDialog({
  category,
  categories,
  onDone,
}: {
  category: CategorySchema | null;
  categories: CategorySchema[];
  onDone: () => void;
}) {
  return (
    <AlertDialog
      open={category !== null}
      onOpenChange={(open) => !open && onDone()}
    >
      <AlertDialogContent>
        {category && (
          <DeleteCategoryForm
            key={category.id}
            category={category}
            categories={categories}
            onDone={onDone}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteCategoryForm({
  category,
  categories,
  onDone,
}: {
  category: CategorySchema;
  categories: CategorySchema[];
  onDone: () => void;
}) {
  const [choice, setChoice] = useState<Choice>("move");
  const [target, setTarget] = useState("");
  const refresh = useRefreshCategorization();
  const mutation = useMutation({
    ...deleteCategoryMutation({ client }),
    onSuccess: () => {
      toast.success(`${category.name} deleted`);
      onDone();
    },
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't delete the category")),
    onSettled: refresh,
  });

  const inUse = category.transaction_count > 0 || category.rule_count > 0;
  const targets = moveTargets(categories, category);
  const ready = !inUse || choice === "uncategorize" || target !== "";
  const held = [
    category.transaction_count > 0 &&
      plural(category.transaction_count, "transaction"),
    category.rule_count > 0 && plural(category.rule_count, "rule"),
  ]
    .filter(Boolean)
    .join(" and ");

  const submit = () =>
    mutation.mutate({
      path: { category_id: category.id },
      query: !inUse
        ? {}
        : choice === "move"
          ? { move_to: target }
          : { leave_uncategorized: true },
    });

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {category.name}?</AlertDialogTitle>
        <AlertDialogDescription>
          {inUse
            ? `It has ${held}. Choose where they go.`
            : "Nothing is filed under it, so nothing else changes."}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {inUse && (
        <fieldset className="space-y-2.5 text-13 text-white/75">
          <legend className="sr-only">What happens to them</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="delete-choice"
              checked={choice === "move"}
              onChange={() => setChoice("move")}
              className="accent-primary-500"
            />
            Move them to another category
          </label>
          {choice === "move" && (
            <div className="pl-6">
              <CategoryPicker
                value={target}
                onChange={setTarget}
                categories={targets}
                placeholder="Choose where they go"
              />
            </div>
          )}
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="delete-choice"
              checked={choice === "uncategorize"}
              onChange={() => setChoice("uncategorize")}
              className="accent-primary-500"
            />
            {category.rule_count > 0
              ? `Leave them uncategorized and delete its ${plural(category.rule_count, "rule")}`
              : "Leave them uncategorized"}
          </label>
        </fieldset>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={!ready || mutation.isPending}
          onClick={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {mutation.isPending ? "Deleting…" : "Delete category"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}

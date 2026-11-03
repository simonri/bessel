import type { CategorySchema } from "@bessel/client";
import { createCategoryMutation, updateCategoryMutation } from "@bessel/client";
import { Checkbox } from "@bessel/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { Label } from "@bessel/ui/components/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@bessel/ui/components/native-select";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { PrimaryButton, SoftButton, TextInput } from "@/components/ui-kit";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS } from "./categorization";
import { useRefreshCategorization } from "./use-refresh";

/** What the dialog edits: an existing category or group, or a new one (in `groupId`, or a new group when null). */
export type CategoryTarget =
  | { kind: "edit"; category: CategorySchema }
  | { kind: "new"; groupId: string | null };

export function CategoryDialog({
  target,
  groups,
  onDone,
}: {
  target: CategoryTarget | null;
  groups: CategorySchema[];
  onDone: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        {target && (
          <CategoryForm
            key={target.kind === "edit" ? target.category.id : "new"}
            target={target}
            groups={groups}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  target,
  groups,
  onDone,
}: {
  target: CategoryTarget;
  groups: CategorySchema[];
  onDone: () => void;
}) {
  const refresh = useRefreshCategorization();
  const editing = target.kind === "edit" ? target.category : null;
  const groupId = editing
    ? editing.parent_id
    : target.kind === "new"
      ? target.groupId
      : null;
  const isGroup = groupId === null;
  const startGroup = groups.find((g) => g.id === groupId);

  const onError = (error: unknown) =>
    toast.error(errorDetail(error, "Couldn't save the category"));
  const create = useMutation({
    ...createCategoryMutation({ client }),
    onSuccess: () => onDone(),
    onError,
    onSettled: refresh,
  });
  const update = useMutation({
    ...updateCategoryMutation({ client }),
    onSuccess: () => onDone(),
    onError,
    onSettled: refresh,
  });

  const form = useForm({
    defaultValues: {
      name: editing?.name ?? "",
      color: editing?.color ?? startGroup?.color ?? CATEGORY_COLORS[0],
      groupId: groupId ?? "",
      // A new category is kept out of reports like the rest of its group.
      excluded: editing?.excluded ?? startGroup?.excluded ?? false,
      income: editing?.income ?? false,
    },
    onSubmit: ({ value }) => {
      const fields = {
        name: value.name.trim(),
        color: value.color,
        excluded: value.excluded,
        income: value.income,
      };
      if (editing) {
        update.mutate({
          path: { category_id: editing.id },
          body: isGroup ? fields : { ...fields, parent_id: value.groupId },
        });
      } else {
        create.mutate({
          body: { ...fields, parent_id: isGroup ? null : value.groupId },
        });
      }
    },
  });

  const noun = isGroup ? "group" : "category";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${noun}` : `New ${noun}`}</DialogTitle>
        <DialogDescription>
          {isGroup
            ? "Groups hold categories, like Privat and Företaget."
            : "Transactions are filed under categories; groups only hold them."}
        </DialogDescription>
      </DialogHeader>

      <form.Field name="name">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="category-name">Name</Label>
            <TextInput
              id="category-name"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>
        )}
      </form.Field>

      {!isGroup && (
        <form.Field name="groupId">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="category-group">Group</Label>
              <div className="[&>div]:w-full">
                <NativeSelect
                  id="category-group"
                  value={field.state.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                    const group = groups.find((g) => g.id === e.target.value);
                    if (group && !editing)
                      form.setFieldValue("excluded", group.excluded);
                  }}
                  className="w-full"
                >
                  {groups.map((group) => (
                    <NativeSelectOption key={group.id} value={group.id}>
                      {group.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}
        </form.Field>
      )}

      <form.Field name="color">
        {(field) => (
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-12 leading-none font-medium text-white/60">
              Color
            </legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Color ${color}`}
                  aria-pressed={field.state.value.toLowerCase() === color}
                  onClick={() => field.handleChange(color)}
                  className={cn(
                    "size-6 rounded-full border-2 border-transparent outline-none transition-transform duration-150 hover:scale-110 focus-visible:ring-1 focus-visible:ring-white/40",
                    field.state.value.toLowerCase() === color &&
                      "border-white/80",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom color"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </div>
          </fieldset>
        )}
      </form.Field>

      <div className="space-y-2">
        <form.Field name="excluded">
          {(field) => (
            <label className="flex items-center gap-2 text-13 text-white/70">
              <Checkbox
                checked={field.state.value}
                onCheckedChange={(checked) =>
                  field.handleChange(checked === true)
                }
              />
              {isGroup
                ? "Keep new categories in it out of reports"
                : "Keep out of reports, like moves between your own accounts"}
            </label>
          )}
        </form.Field>
        {!isGroup && (
          <form.Field name="income">
            {(field) => (
              <label className="flex items-center gap-2 text-13 text-white/70">
                <Checkbox
                  checked={field.state.value}
                  onCheckedChange={(checked) =>
                    field.handleChange(checked === true)
                  }
                />
                Money in counts as income; otherwise it's money back
              </label>
            )}
          </form.Field>
        )}
      </div>

      <DialogFooter>
        <SoftButton size="default" onClick={onDone}>
          Cancel
        </SoftButton>
        <form.Subscribe
          selector={(s) =>
            s.values.name.trim().length > 0 && (isGroup || s.values.groupId)
          }
        >
          {(valid) => (
            <PrimaryButton
              type="submit"
              disabled={!valid || create.isPending || update.isPending}
            >
              {create.isPending || update.isPending
                ? "Saving…"
                : `Save ${noun}`}
            </PrimaryButton>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

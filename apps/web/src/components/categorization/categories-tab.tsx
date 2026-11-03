import type { CategorySchema } from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { FolderPlus, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  EmptyState,
  IconButton,
  Panel,
  PrimaryButton,
  placeholderKeys,
  SoftButton,
} from "@/components/ui-kit";
import { groupCategories, plural } from "./categorization";
import { CategoryDialog, type CategoryTarget } from "./category-dialog";
import { DeleteCategoryDialog } from "./delete-category-dialog";

export function CategoriesTab({
  categories,
  isLoading,
}: {
  categories: CategorySchema[];
  isLoading: boolean;
}) {
  const [target, setTarget] = useState<CategoryTarget | null>(null);
  const [deleting, setDeleting] = useState<CategorySchema | null>(null);
  const groups = useMemo(() => groupCategories(categories), [categories]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-12 text-white/50">
          Transactions are filed under categories; groups keep them apart, like
          your company's money from your own.
        </p>
        <SoftButton onClick={() => setTarget({ kind: "new", groupId: null })}>
          <FolderPlus />
          New group
        </SoftButton>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {placeholderKeys(6).map((key) => (
            <Skeleton
              key={key}
              className="h-10 w-full rounded-lg bg-white/[0.06]"
            />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon={<Tags />} title="No categories yet">
          Start with a group, such as Privat, then add categories to it.
        </EmptyState>
      ) : (
        groups.map(({ group, categories: members }) => (
          <section key={group.id} aria-label={group.name}>
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              <h3 className="min-w-0 flex-1 truncate text-13 font-medium text-white/80">
                {group.name}
                {group.excluded && (
                  <span className="ml-2 type-caption font-normal text-white/40">
                    Kept out of reports
                  </span>
                )}
              </h3>
              <IconButton
                title={`Edit ${group.name}`}
                onClick={() => setTarget({ kind: "edit", category: group })}
              >
                <Pencil />
              </IconButton>
              <IconButton
                title={
                  members.length > 0
                    ? "Move or delete its categories first"
                    : `Delete ${group.name}`
                }
                destructive
                disabled={members.length > 0}
                onClick={() => setDeleting(group)}
              >
                <Trash2 />
              </IconButton>
              <PrimaryButton
                size="sm"
                onClick={() => setTarget({ kind: "new", groupId: group.id })}
              >
                <Plus />
                Category
              </PrimaryButton>
            </div>
            {members.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-3 text-12 text-white/40">
                No categories in this group yet.
              </p>
            ) : (
              <Panel>
                {members.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    onEdit={() => setTarget({ kind: "edit", category })}
                    onDelete={() => setDeleting(category)}
                  />
                ))}
              </Panel>
            )}
          </section>
        ))
      )}

      <CategoryDialog
        target={target}
        groups={groups.map((g) => g.group)}
        onDone={() => setTarget(null)}
      />
      <DeleteCategoryDialog
        category={deleting}
        categories={categories}
        onDone={() => setDeleting(null)}
      />
    </div>
  );
}

function CategoryRow({
  category,
  onEdit,
  onDelete,
}: {
  category: CategorySchema;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const details = [
    category.income && "Income",
    category.excluded && "Kept out of reports",
    plural(category.transaction_count, "transaction"),
    category.rule_count > 0 && plural(category.rule_count, "rule"),
  ].filter(Boolean);
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-2.5">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-white/25"
      >
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
        />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-13 text-white/85">
            {category.name}
          </span>
          <span className="truncate type-caption tabular-nums text-white/40">
            {details.join(" - ")}
          </span>
        </span>
      </button>
      <IconButton title={`Edit ${category.name}`} onClick={onEdit}>
        <Pencil />
      </IconButton>
      <IconButton
        title={`Delete ${category.name}`}
        destructive
        onClick={onDelete}
      >
        <Trash2 />
      </IconButton>
    </div>
  );
}

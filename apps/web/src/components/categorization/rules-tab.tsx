import type { CategoryRuleSchema, CategorySchema } from "@bessel/client";
import {
  deleteCategoryRuleMutation,
  listCategoryRulesOptions,
} from "@bessel/client";
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
import { Checkbox } from "@bessel/ui/components/checkbox";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, ListFilter, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  IconButton,
  Panel,
  PrimaryButton,
  placeholderKeys,
  TextInput,
} from "@/components/ui-kit";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import { filterRules, plural, ruleConditions } from "./categorization";
import { RuleDialog } from "./rule-dialog";
import { useRefreshCategorization } from "./use-refresh";

export function RulesTab({ categories }: { categories: CategorySchema[] }) {
  const { data, isLoading } = useQuery(listCategoryRulesOptions({ client }));
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CategoryRuleSchema | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CategoryRuleSchema | null>(null);
  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const rules = data?.items ?? [];
  const shown = filterRules(rules, byId, search);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search rules or categories"
          aria-label="Search rules"
          className="max-w-xs flex-1"
        />
        <PrimaryButton
          size="sm"
          className="ml-auto"
          onClick={() => setCreating(true)}
        >
          <Plus />
          New rule
        </PrimaryButton>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {placeholderKeys(5).map((key) => (
            <Skeleton
              key={key}
              className="h-12 w-full rounded-lg bg-white/[0.06]"
            />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState icon={<ListFilter />} title="No rules yet">
          A rule sorts every transaction whose bank text contains some words,
          now and in later imports.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title="No matching rules">
          No rule's text or category contains &ldquo;{search}&rdquo;.
        </EmptyState>
      ) : (
        <Panel>
          {shown.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              category={byId.get(rule.category_id)}
              onEdit={() => setEditing(rule)}
              onDelete={() => setDeleting(rule)}
            />
          ))}
        </Panel>
      )}

      <RuleDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (open) return;
          setCreating(false);
          setEditing(null);
        }}
        rule={editing}
        categories={categories}
      />
      <DeleteRuleDialog rule={deleting} onDone={() => setDeleting(null)} />
    </div>
  );
}

function RuleRow({
  rule,
  category,
  onEdit,
  onDelete,
}: {
  rule: CategoryRuleSchema;
  category: CategorySchema | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const conditions = ruleConditions(rule);
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-2.5">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-white/25"
      >
        <span className="flex min-w-0 max-w-full items-center gap-2 text-13">
          <span className="truncate font-medium text-white/85">
            &ldquo;{rule.pattern}&rdquo;
          </span>
          <ArrowRight className="size-3.5 shrink-0 text-white/30" />
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: category?.color ?? "#6B7280" }}
          />
          <span className="truncate text-white/70">
            {category?.name ?? "Unknown category"}
          </span>
        </span>
        <span className="truncate type-caption text-white/40">
          {[...conditions, plural(rule.transaction_count, "transaction")].join(
            " - ",
          )}
        </span>
      </button>
      <IconButton title="Edit rule" onClick={onEdit}>
        <Pencil />
      </IconButton>
      <IconButton title="Delete rule" destructive onClick={onDelete}>
        <Trash2 />
      </IconButton>
    </div>
  );
}

function DeleteRuleDialog({
  rule,
  onDone,
}: {
  rule: CategoryRuleSchema | null;
  onDone: () => void;
}) {
  const [release, setRelease] = useState(false);
  const refresh = useRefreshCategorization();
  const close = () => {
    setRelease(false);
    onDone();
  };
  const mutation = useMutation({
    ...deleteCategoryRuleMutation({ client }),
    onSuccess: () => {
      toast.success("Rule deleted");
      close();
    },
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't delete the rule")),
    onSettled: refresh,
  });
  const count = rule?.transaction_count ?? 0;

  return (
    <AlertDialog open={rule !== null} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete the rule for &ldquo;{rule?.pattern}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            New imports won't be sorted by it.
            {count > 0 &&
              ` The ${plural(count, "transaction")} it sorted keep their category unless you take it back.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {count > 0 && (
          <label className="flex items-center gap-2 text-13 text-white/70">
            <Checkbox
              checked={release}
              onCheckedChange={(checked) => setRelease(checked === true)}
            />
            Take it back, so your other rules or you sort them again
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={mutation.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (!rule) return;
              mutation.mutate({
                path: { rule_id: rule.id },
                query: { release },
              });
            }}
          >
            {mutation.isPending ? "Deleting…" : "Delete rule"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

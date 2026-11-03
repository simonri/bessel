import type {
  CategoryRulePreview,
  CategoryRuleSchema,
  CategorySchema,
  RuleScope,
  TransactionDirection,
} from "@bessel/client";
import {
  createCategoryRuleMutation,
  previewCategoryRule,
  updateCategoryRuleMutation,
} from "@bessel/client";
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
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PrimaryButton, SoftButton, TextInput } from "@/components/ui-kit";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import { Amount } from "@/lib/privacy";
import { DIRECTION_LABELS, plural, SCOPE_LABELS } from "./categorization";
import { CategoryPicker } from "./category-picker";
import { useRefreshCategorization } from "./use-refresh";

const PREVIEW_DELAY_MS = 300;
const MIN_PATTERN = 2;

type Direction = TransactionDirection | "both";

export interface RuleValues {
  pattern: string;
  categoryId: string;
  scope: RuleScope;
  direction: Direction;
  markBusiness: boolean;
  applyNow: boolean;
}

function initialValues(rule: CategoryRuleSchema | null): RuleValues {
  return {
    pattern: rule?.pattern ?? "",
    categoryId: rule?.category_id ?? "",
    scope: rule?.scope ?? "any",
    direction: rule?.direction ?? "both",
    markBusiness: rule?.mark_business ?? false,
    // A new rule usually should sort what's already here; an edit already re-sorts what the rule sorted.
    applyNow: rule === null,
  };
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function useRulePreview(
  values: Pick<RuleValues, "pattern" | "scope" | "direction">,
  ruleId: string | undefined,
) {
  const body = useDebounced(
    {
      pattern: values.pattern,
      scope: values.scope,
      direction: values.direction === "both" ? null : values.direction,
      rule_id: ruleId ?? null,
    },
    PREVIEW_DELAY_MS,
  );
  return useQuery({
    queryKey: ["categoryRulePreview", body],
    queryFn: async () =>
      (await previewCategoryRule({ client, body, throwOnError: true })).data,
    enabled: body.pattern.trim().length >= MIN_PATTERN,
    placeholderData: keepPreviousData,
  });
}

export function RuleDialog({
  open,
  onOpenChange,
  rule,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rule to edit; null for a new one. */
  rule: CategoryRuleSchema | null;
  categories: CategorySchema[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open && (
          <RuleForm
            key={rule?.id ?? "new"}
            rule={rule}
            categories={categories}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RuleForm({
  rule,
  categories,
  onDone,
}: {
  rule: CategoryRuleSchema | null;
  categories: CategorySchema[];
  onDone: () => void;
}) {
  const refresh = useRefreshCategorization();
  const onSaved = (categorized: number) => {
    toast.success(
      categorized > 0
        ? `Rule saved, and ${plural(categorized, "transaction")} sorted`
        : "Rule saved",
    );
    onDone();
  };
  const onError = (error: unknown) =>
    toast.error(errorDetail(error, "Couldn't save the rule"));
  const create = useMutation({
    ...createCategoryRuleMutation({ client }),
    onSuccess: (saved) => onSaved(saved.categorized),
    onError,
    onSettled: refresh,
  });
  const update = useMutation({
    ...updateCategoryRuleMutation({ client }),
    onSuccess: (saved) => onSaved(saved.categorized),
    onError,
    onSettled: refresh,
  });

  const form = useForm({
    defaultValues: initialValues(rule),
    onSubmit: ({ value }) => {
      const body = {
        category_id: value.categoryId,
        pattern: value.pattern,
        scope: value.scope,
        direction: value.direction === "both" ? null : value.direction,
        mark_business: value.markBusiness,
        apply_now: value.applyNow,
      };
      if (rule) update.mutate({ path: { rule_id: rule.id }, body });
      else create.mutate({ body });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex min-w-0 flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
        <DialogDescription>
          Sorts transactions whose bank text contains this, on every import.
          Categories you chose yourself are never changed.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <form.Field name="pattern">
          {(field) => (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rule-pattern">Bank text contains</Label>
              <TextInput
                id="rule-pattern"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="For example ICA"
                maxLength={255}
                autoFocus
              />
            </div>
          )}
        </form.Field>
        <form.Field name="categoryId">
          {(field) => (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rule-category">Category</Label>
              <CategoryPicker
                id="rule-category"
                value={field.state.value}
                onChange={field.handleChange}
                categories={categories}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="scope">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="rule-scope">Accounts</Label>
              <div className="[&>div]:w-full">
                <NativeSelect
                  id="rule-scope"
                  value={field.state.value}
                  onChange={(e) =>
                    field.handleChange(e.target.value as RuleScope)
                  }
                  className="w-full"
                >
                  {(Object.keys(SCOPE_LABELS) as RuleScope[]).map((scope) => (
                    <NativeSelectOption key={scope} value={scope}>
                      {SCOPE_LABELS[scope]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}
        </form.Field>
        <form.Field name="direction">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="rule-direction">Direction</Label>
              <div className="[&>div]:w-full">
                <NativeSelect
                  id="rule-direction"
                  value={field.state.value}
                  onChange={(e) =>
                    field.handleChange(e.target.value as Direction)
                  }
                  className="w-full"
                >
                  {(Object.keys(DIRECTION_LABELS) as Direction[]).map((d) => (
                    <NativeSelectOption key={d} value={d}>
                      {DIRECTION_LABELS[d]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}
        </form.Field>
        <form.Field name="markBusiness">
          {(field) => (
            <label className="flex items-center gap-2 text-13 text-white/70 sm:col-span-2">
              <Checkbox
                checked={field.state.value}
                onCheckedChange={(checked) =>
                  field.handleChange(checked === true)
                }
              />
              Also mark matches as business, for company costs paid privately
            </label>
          )}
        </form.Field>
      </div>

      <form.Subscribe selector={(s) => s.values}>
        {(values) => (
          <RulePreviewSection
            values={values}
            rule={rule}
            categories={categories}
            applyNow={values.applyNow}
            onApplyNowChange={(v) => form.setFieldValue("applyNow", v)}
          />
        )}
      </form.Subscribe>

      <DialogFooter>
        <SoftButton size="default" onClick={onDone}>
          Cancel
        </SoftButton>
        <form.Subscribe
          selector={(s) =>
            s.values.pattern.trim().length >= MIN_PATTERN &&
            s.values.categoryId !== ""
          }
        >
          {(valid) => (
            <PrimaryButton
              type="submit"
              disabled={!valid || create.isPending || update.isPending}
            >
              {create.isPending || update.isPending ? "Saving…" : "Save rule"}
            </PrimaryButton>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

function RulePreviewSection({
  values,
  rule,
  categories,
  applyNow,
  onApplyNowChange,
}: {
  values: RuleValues;
  rule: CategoryRuleSchema | null;
  categories: CategorySchema[];
  applyNow: boolean;
  onApplyNowChange: (value: boolean) => void;
}) {
  const { data, isFetching, isError } = useRulePreview(values, rule?.id);
  const ready = values.pattern.trim().length >= MIN_PATTERN;
  const sortable = data?.sortable_count ?? 0;

  return (
    <section
      aria-label="Preview"
      className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.03]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <p className="text-13 text-white/70" aria-live="polite">
          {!ready
            ? "Type at least two characters to see what it matches."
            : isError
              ? "Couldn't load the preview."
              : data
                ? previewSummary(data, rule)
                : "Looking…"}
        </p>
        {isFetching && ready && (
          <span className="type-caption text-white/35">Updating…</span>
        )}
      </div>
      {ready && data && data.items.length > 0 && (
        <PreviewList preview={data} categories={categories} />
      )}
      <label className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2.5 text-13 text-white/70">
        <Checkbox
          checked={applyNow}
          onCheckedChange={(checked) => onApplyNowChange(checked === true)}
          aria-label="Apply to existing transactions"
        />
        {ready && data
          ? `Also sort the ${plural(sortable, "uncategorized transaction")} it matches`
          : "Also sort the uncategorized transactions it matches"}
      </label>
    </section>
  );
}

export function previewSummary(
  preview: CategoryRulePreview,
  rule: CategoryRuleSchema | null,
): string {
  if (preview.match_count === 0)
    return "Matches nothing here yet; it will sort new imports.";
  const base = `Matches ${plural(preview.match_count, "transaction")} already here`;
  if (rule && rule.transaction_count > 0)
    return `${base}. The ${plural(rule.transaction_count, "one")} it sorted follow the change.`;
  return `${base}.`;
}

function PreviewList({
  preview,
  categories,
}: {
  preview: CategoryRulePreview;
  categories: CategorySchema[];
}) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const hidden = preview.match_count - preview.items.length;
  return (
    <ul className="max-h-56 divide-y divide-white/[0.05] overflow-y-auto border-t border-white/[0.06]">
      {preview.items.map((item) => {
        const category = item.category_id
          ? byId.get(item.category_id)
          : undefined;
        return (
          <li
            key={item.id}
            className="flex min-w-0 items-center gap-3 px-3 py-1.5 text-12"
          >
            <span className="w-20 shrink-0 tabular-nums text-white/40">
              {format(item.transaction_date, "d MMM yyyy")}
            </span>
            <span className="min-w-0 flex-1 truncate text-white/80">
              {item.name ?? item.description}
            </span>
            <span className="hidden shrink-0 truncate text-white/45 sm:inline">
              {item.would_sort
                ? item.category_id
                  ? "Follows this rule"
                  : "Will be sorted"
                : category
                  ? `${category.name} - ${item.by_rule ? "another rule" : "your choice"}`
                  : "Stays uncategorized"}
            </span>
            <Amount
              value={item.direction === "credit" ? item.amount : -item.amount}
              currency={item.currency}
              exact
              className="w-24 shrink-0 text-right text-white/70"
            />
          </li>
        );
      })}
      {hidden > 0 && (
        <li className="px-3 py-1.5 text-12 text-white/40">
          And {plural(hidden, "older one")}
        </li>
      )}
    </ul>
  );
}

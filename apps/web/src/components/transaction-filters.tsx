import { useState } from "react";
import { format } from "date-fns";
import { Filter, Search, X } from "lucide-react";
import type { BankAccountSchema, CategorySchema } from "@metron/client";
import { Button } from "@metron/ui/components/button";
import { Badge } from "@metron/ui/components/badge";
import { Checkbox } from "@metron/ui/components/checkbox";
import { Input } from "@metron/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@metron/ui/components/popover";
import { Separator } from "@metron/ui/components/separator";
import { cn } from "@metron/ui/lib/utils";

export interface TransactionFilters {
  bank_account_id?: string[];
  category_id?: string[];
  uncategorized?: boolean;
  direction?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

interface TransactionFiltersProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  accounts: BankAccountSchema[];
  categories: CategorySchema[];
}

type FilterField = "account" | "category" | "direction" | "search" | "date";

const FILTER_LABELS: Record<FilterField, string> = {
  account: "Account",
  category: "Category",
  direction: "Direction",
  search: "Search",
  date: "Date",
};

function hasActiveFilters(filters: TransactionFilters): boolean {
  return !!(
    filters.bank_account_id?.length ||
    filters.category_id?.length ||
    filters.uncategorized ||
    filters.direction ||
    filters.search ||
    filters.date_from ||
    filters.date_to
  );
}

function countActiveFilters(filters: TransactionFilters): number {
  let count = 0;
  if (filters.bank_account_id?.length) count++;
  if (filters.category_id?.length || filters.uncategorized) count++;
  if (filters.direction) count++;
  if (filters.search) count++;
  if (filters.date_from || filters.date_to) count++;
  return count;
}

function formatDateLabel(dateFrom?: string, dateTo?: string): string {
  const fmt = (d: string) => format(new Date(d + "T00:00:00"), "MMM d");
  if (dateFrom && dateTo) return `${fmt(dateFrom)} \u2013 ${fmt(dateTo)}`;
  if (dateFrom) return `From ${fmt(dateFrom)}`;
  return `Until ${fmt(dateTo!)}`;
}

export function TransactionFiltersPopover({
  filters,
  onFiltersChange,
  accounts,
  categories,
}: TransactionFiltersProps) {
  const [activeField, setActiveField] = useState<FilterField>("account");
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const [dateFromInput, setDateFromInput] = useState(filters.date_from ?? "");
  const [dateToInput, setDateToInput] = useState(filters.date_to ?? "");
  const active = hasActiveFilters(filters);
  const activeCount = countActiveFilters(filters);

  const parentCategories = categories.filter((c) => !c.parent_id);
  const childCategories = categories.filter((c) => c.parent_id);

  const toggleArrayFilter = (key: "bank_account_id" | "category_id", id: string) => {
    const current = filters[key] ?? [];
    const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
    onFiltersChange({ ...filters, [key]: next.length ? next : undefined });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="size-4" />
          Filter
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-0.5 size-5 rounded-full p-0 text-[10px]">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto min-w-[460px] p-0">
        <div className="flex">
          {/* Left panel — field list */}
          <div className="w-[160px] border-r p-1.5">
            {(Object.keys(FILTER_LABELS) as FilterField[]).map((field) => {
              const isFieldActive =
                (field === "account" && !!filters.bank_account_id?.length) ||
                (field === "category" &&
                  (!!filters.category_id?.length || !!filters.uncategorized)) ||
                (field === "direction" && !!filters.direction) ||
                (field === "search" && !!filters.search) ||
                (field === "date" && !!(filters.date_from || filters.date_to));

              return (
                <button
                  key={field}
                  type="button"
                  onPointerEnter={() => setActiveField(field)}
                  onClick={() => setActiveField(field)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-sm transition-colors",
                    activeField === field
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50",
                  )}
                >
                  {FILTER_LABELS[field]}
                  {isFieldActive && <span className="bg-primary size-1.5 rounded-full" />}
                </button>
              );
            })}
            {active && (
              <>
                <Separator className="my-1.5" />
                <button
                  type="button"
                  onClick={() => {
                    onFiltersChange({});
                    setSearchInput("");
                    setDateFromInput("");
                    setDateToInput("");
                  }}
                  className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm transition-colors"
                >
                  <X className="size-3.5" />
                  Clear all
                </button>
              </>
            )}
          </div>

          {/* Right panel — filter controls */}
          <div className="w-[300px] p-2">
            {activeField === "account" && (
              <AccountFilter
                accounts={accounts}
                selected={filters.bank_account_id ?? []}
                onToggle={(id) => toggleArrayFilter("bank_account_id", id)}
              />
            )}
            {activeField === "category" && (
              <CategoryFilter
                parents={parentCategories}
                children={childCategories}
                selected={filters.category_id ?? []}
                uncategorized={filters.uncategorized ?? false}
                onToggle={(id) => {
                  if (filters.uncategorized) {
                    onFiltersChange({ ...filters, uncategorized: undefined });
                  }
                  toggleArrayFilter("category_id", id);
                }}
                onToggleUncategorized={() => {
                  onFiltersChange({
                    ...filters,
                    uncategorized: !filters.uncategorized ? true : undefined,
                    category_id: !filters.uncategorized ? undefined : filters.category_id,
                  });
                }}
              />
            )}
            {activeField === "direction" && (
              <DirectionFilter
                value={filters.direction}
                onChange={(d) => onFiltersChange({ ...filters, direction: d || undefined })}
              />
            )}
            {activeField === "search" && (
              <SearchFilter
                value={searchInput}
                onChange={setSearchInput}
                onApply={() =>
                  onFiltersChange({
                    ...filters,
                    search: searchInput.trim() || undefined,
                  })
                }
                onClear={() => {
                  setSearchInput("");
                  onFiltersChange({ ...filters, search: undefined });
                }}
              />
            )}
            {activeField === "date" && (
              <DateRangeFilter
                dateFrom={dateFromInput}
                dateTo={dateToInput}
                onDateFromChange={setDateFromInput}
                onDateToChange={setDateToInput}
                onApply={() =>
                  onFiltersChange({
                    ...filters,
                    date_from: dateFromInput || undefined,
                    date_to: dateToInput || undefined,
                  })
                }
                onClear={() => {
                  setDateFromInput("");
                  setDateToInput("");
                  onFiltersChange({
                    ...filters,
                    date_from: undefined,
                    date_to: undefined,
                  });
                }}
              />
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccountFilter({
  accounts,
  selected,
  onToggle,
}: {
  accounts: BankAccountSchema[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (accounts.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-sm">No accounts</p>;
  }

  return (
    <div className="space-y-0.5">
      {accounts.map((acc) => (
        <label
          key={acc.id}
          className="hover:bg-accent flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors"
        >
          <Checkbox checked={selected.includes(acc.id)} onCheckedChange={() => onToggle(acc.id)} />
          <span className="truncate">{acc.name}</span>
        </label>
      ))}
    </div>
  );
}

function CategoryFilter({
  parents,
  children,
  selected,
  uncategorized,
  onToggle,
  onToggleUncategorized,
}: {
  parents: CategorySchema[];
  children: CategorySchema[];
  selected: string[];
  uncategorized: boolean;
  onToggle: (id: string) => void;
  onToggleUncategorized: () => void;
}) {
  const childrenByParent = new Map<string, CategorySchema[]>();
  for (const cat of children) {
    if (cat.parent_id) {
      const list = childrenByParent.get(cat.parent_id) ?? [];
      list.push(cat);
      childrenByParent.set(cat.parent_id, list);
    }
  }

  return (
    <div className="max-h-[280px] space-y-0.5 overflow-y-auto">
      <label className="hover:bg-accent flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors">
        <Checkbox checked={uncategorized} onCheckedChange={onToggleUncategorized} />
        <span className="text-muted-foreground italic">Uncategorized</span>
      </label>
      {parents.map((parent) => {
        const kids = childrenByParent.get(parent.id) ?? [];
        if (kids.length === 0) return null;
        return (
          <div key={parent.id}>
            <div className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">
              {parent.name}
            </div>
            {kids.map((cat) => (
              <label
                key={cat.id}
                className="hover:bg-accent flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors"
              >
                <Checkbox
                  checked={selected.includes(cat.id)}
                  onCheckedChange={() => onToggle(cat.id)}
                />
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="truncate">{cat.name}</span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DirectionFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const options = [
    { value: undefined, label: "All" },
    { value: "debit", label: "Debit (expenses)" },
    { value: "credit", label: "Credit (income)" },
  ] as const;

  return (
    <div className="space-y-0.5">
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex w-full items-center rounded-sm px-2.5 py-1.5 text-sm transition-colors",
            value === opt.value
              ? "bg-accent text-accent-foreground font-medium"
              : "hover:bg-accent/50",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SearchFilter({
  value,
  onChange,
  onApply,
  onClear,
}: {
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onApply();
          }}
          placeholder="Search descriptions..."
          className="border-input bg-background placeholder:text-muted-foreground h-8 w-full rounded-md border pl-8 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" className="h-7 text-xs" onClick={onApply}>
          Apply
        </Button>
        {value && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

function DateRangeFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onApply,
  onClear,
}: {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">From</label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">To</label>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" className="h-7 text-xs" onClick={onApply}>
          Apply
        </Button>
        {(dateFrom || dateTo) && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

export function ActiveFilters({
  filters,
  onFiltersChange,
  accounts,
  categories,
}: TransactionFiltersProps) {
  if (!hasActiveFilters(filters)) return null;

  const pills: { label: string; onRemove: () => void }[] = [];

  if (filters.bank_account_id?.length) {
    const names = filters.bank_account_id
      .map((id) => accounts.find((a) => a.id === id)?.name ?? id)
      .join(", ");
    pills.push({
      label: `Account: ${names}`,
      onRemove: () => onFiltersChange({ ...filters, bank_account_id: undefined }),
    });
  }

  if (filters.category_id?.length) {
    const names = filters.category_id
      .map((id) => categories.find((c) => c.id === id)?.name ?? id)
      .join(", ");
    pills.push({
      label: `Category: ${names}`,
      onRemove: () => onFiltersChange({ ...filters, category_id: undefined }),
    });
  }

  if (filters.uncategorized) {
    pills.push({
      label: "Uncategorized",
      onRemove: () => onFiltersChange({ ...filters, uncategorized: undefined }),
    });
  }

  if (filters.direction) {
    pills.push({
      label: `Direction: ${filters.direction}`,
      onRemove: () => onFiltersChange({ ...filters, direction: undefined }),
    });
  }

  if (filters.search) {
    pills.push({
      label: `Search: "${filters.search}"`,
      onRemove: () => onFiltersChange({ ...filters, search: undefined }),
    });
  }

  if (filters.date_from || filters.date_to) {
    pills.push({
      label: `Date: ${formatDateLabel(filters.date_from, filters.date_to)}`,
      onRemove: () =>
        onFiltersChange({
          ...filters,
          date_from: undefined,
          date_to: undefined,
        }),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((pill) => (
        <Badge key={pill.label} variant="secondary" className="gap-1 pr-1">
          {pill.label}
          <button
            type="button"
            onClick={pill.onRemove}
            className="hover:bg-muted-foreground/20 ml-0.5 rounded-full p-0.5 transition-colors"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

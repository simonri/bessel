import type { BankAccountSchema, CategorySchema } from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
import { Checkbox } from "@bessel/ui/components/checkbox";
import { Input } from "@bessel/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { cn } from "@bessel/ui/lib/utils";
// Note: date range filter removed — month navigation in transactions.tsx handles date scoping
import { Briefcase, ChevronDown, Search, X } from "lucide-react";
import { useRef, useState } from "react";

export interface TransactionFilters {
  bank_account_id?: string[];
  category_id?: string[];
  uncategorized?: boolean;
  direction?: string;
  is_business?: boolean;
  search?: string;
  year?: number;
  month?: number;
}

interface TransactionFiltersBarProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  accounts: BankAccountSchema[];
  categories: CategorySchema[];
}

function hasActiveFilters(filters: TransactionFilters): boolean {
  return !!(
    filters.bank_account_id?.length ||
    filters.category_id?.length ||
    filters.uncategorized ||
    filters.direction ||
    filters.is_business !== undefined ||
    filters.search
  );
}

// ─── Account multi-select ────────────────────────────────────────────────────

function AccountDropdown({
  accounts,
  selected,
  onToggle,
  onClear,
}: {
  accounts: BankAccountSchema[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const label =
    selected.length === 0
      ? "Account"
      : selected.length === 1
        ? (accounts.find((a) => a.id === selected[0])?.name ?? "Account")
        : `${selected.length} accounts`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
            selected.length > 0
              ? "border-primary/40 bg-primary/5 text-foreground"
              : "border-input hover:bg-accent text-muted-foreground",
          )}
        >
          <span className="max-w-[120px] truncate">{label}</span>
          {selected.length > 0 ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </span>
          ) : (
            <ChevronDown className="size-3" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1.5">
        {accounts.length === 0 ? (
          <p className="text-muted-foreground py-2 text-center text-sm">
            No accounts
          </p>
        ) : (
          accounts.map((acc) => (
            <label
              key={acc.id}
              className="hover:bg-accent flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm"
            >
              <Checkbox
                checked={selected.includes(acc.id)}
                onCheckedChange={() => onToggle(acc.id)}
              />
              <span className="truncate">{acc.name}</span>
            </label>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Category multi-select ───────────────────────────────────────────────────

function CategoryDropdown({
  categories,
  selected,
  uncategorized,
  onToggle,
  onToggleUncategorized,
  onClear,
}: {
  categories: CategorySchema[];
  selected: string[];
  uncategorized: boolean;
  onToggle: (id: string) => void;
  onToggleUncategorized: () => void;
  onClear: () => void;
}) {
  const totalActive = selected.length + (uncategorized ? 1 : 0);
  const label =
    totalActive === 0
      ? "Category"
      : totalActive === 1 && selected.length === 1
        ? (categories.find((c) => c.id === selected[0])?.name ?? "Category")
        : uncategorized && totalActive === 1
          ? "Uncategorized"
          : `${totalActive} categories`;

  const parents = categories.filter((c) => !c.parent_id);
  const childrenByParent = new Map<string, CategorySchema[]>();
  for (const cat of categories) {
    if (cat.parent_id) {
      const list = childrenByParent.get(cat.parent_id) ?? [];
      list.push(cat);
      childrenByParent.set(cat.parent_id, list);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
            totalActive > 0
              ? "border-primary/40 bg-primary/5 text-foreground"
              : "border-input hover:bg-accent text-muted-foreground",
          )}
        >
          <span className="max-w-[120px] truncate">{label}</span>
          {totalActive > 0 ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </span>
          ) : (
            <ChevronDown className="size-3" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-72 w-56 overflow-y-auto p-1.5"
      >
        <label className="hover:bg-accent flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm">
          <Checkbox
            checked={uncategorized}
            onCheckedChange={onToggleUncategorized}
          />
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
                  className="hover:bg-accent flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm"
                >
                  <Checkbox
                    checked={selected.includes(cat.id)}
                    onCheckedChange={() => onToggle(cat.id)}
                  />
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="truncate">{cat.name}</span>
                </label>
              ))}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// ─── Direction toggle ────────────────────────────────────────────────────────

function DirectionToggle({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="border-input flex h-8 overflow-hidden rounded-md border text-sm">
      {(
        [
          { label: "All", value: undefined },
          { label: "Expenses", value: "debit" },
          { label: "Income", value: "credit" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-2.5 transition-colors",
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Business toggle ─────────────────────────────────────────────────────────

function BusinessToggle({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value === true ? undefined : true)}
      title="Show business expenses only"
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors",
        value === true
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-input text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Briefcase className="size-3.5" />
      Business expense
    </button>
  );
}

// ─── Search input ────────────────────────────────────────────────────────────

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search…"
        className="h-8 w-40 pl-8 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

// ─── Date range ──────────────────────────────────────────────────────────────

// ─── Main filter bar ─────────────────────────────────────────────────────────

export function TransactionFiltersBar({
  filters,
  onFiltersChange,
  accounts,
  categories,
}: TransactionFiltersBarProps) {
  const [searchValue, setSearchValue] = useState(filters.search ?? "");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const active = hasActiveFilters(filters);

  const toggleArrayFilter = (
    key: "bank_account_id" | "category_id",
    id: string,
  ) => {
    const current = filters[key] ?? [];
    const next = current.includes(id)
      ? current.filter((v) => v !== id)
      : [...current, id];
    onFiltersChange({ ...filters, [key]: next.length ? next : undefined });
  };

  const handleSearchChange = (val: string) => {
    setSearchValue(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, search: val.trim() || undefined });
    }, 300);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput value={searchValue} onChange={handleSearchChange} />

      <AccountDropdown
        accounts={accounts}
        selected={filters.bank_account_id ?? []}
        onToggle={(id) => toggleArrayFilter("bank_account_id", id)}
        onClear={() =>
          onFiltersChange({ ...filters, bank_account_id: undefined })
        }
      />

      <CategoryDropdown
        categories={categories}
        selected={filters.category_id ?? []}
        uncategorized={filters.uncategorized ?? false}
        onToggle={(id) => {
          if (filters.uncategorized) {
            onFiltersChange({ ...filters, uncategorized: undefined });
          }
          toggleArrayFilter("category_id", id);
        }}
        onToggleUncategorized={() =>
          onFiltersChange({
            ...filters,
            uncategorized: !filters.uncategorized ? true : undefined,
            category_id: !filters.uncategorized
              ? undefined
              : filters.category_id,
          })
        }
        onClear={() =>
          onFiltersChange({
            ...filters,
            category_id: undefined,
            uncategorized: undefined,
          })
        }
      />

      <DirectionToggle
        value={filters.direction}
        onChange={(d) => onFiltersChange({ ...filters, direction: d })}
      />

      <BusinessToggle
        value={filters.is_business}
        onChange={(v) => onFiltersChange({ ...filters, is_business: v })}
      />

      {active && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-8 px-2 text-sm"
          onClick={() => {
            setSearchValue("");
            onFiltersChange({});
          }}
        >
          <X className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}

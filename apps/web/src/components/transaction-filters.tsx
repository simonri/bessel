import type { BankAccountSchema, CategorySchema } from "@bessel/client";
import { Checkbox } from "@bessel/ui/components/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { cn } from "@bessel/ui/lib/utils";
// Note: date range filter removed — month navigation in transactions.tsx handles date scoping
import { Briefcase, ChevronDown, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { TextInput } from "@/components/ui-kit";

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

const CHIP_CLASS =
  "flex h-8 min-w-0 items-center gap-1.5 rounded-lg border px-3 text-12 font-medium transition-colors duration-150";
const CHIP_IDLE_CLASS =
  "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white/85";
const CHIP_ACTIVE_CLASS =
  "border-primary-500/40 bg-primary-500/10 text-white/90";
const OPTION_CLASS =
  "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-13 text-white/80 transition-colors duration-150 hover:bg-white/[0.06]";

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
            CHIP_CLASS,
            selected.length > 0 ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS,
          )}
        >
          <span className="max-w-32 truncate">{label}</span>
          {selected.length > 0 ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="-mr-1 rounded p-0.5 text-white/45 transition-colors duration-150 hover:bg-white/10 hover:text-white/90"
            >
              <X className="size-3" />
            </span>
          ) : (
            <ChevronDown className="size-3" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 rounded-xl p-1.5">
        {accounts.length === 0 ? (
          <p className="py-2 text-center text-12 text-white/40">No accounts</p>
        ) : (
          accounts.map((acc) => (
            <label key={acc.id} className={OPTION_CLASS}>
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
            CHIP_CLASS,
            totalActive > 0 ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS,
          )}
        >
          <span className="max-w-32 truncate">{label}</span>
          {totalActive > 0 ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="-mr-1 rounded p-0.5 text-white/45 transition-colors duration-150 hover:bg-white/10 hover:text-white/90"
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
        className="max-h-72 w-60 overflow-y-auto rounded-xl p-1.5"
      >
        <label className={OPTION_CLASS}>
          <Checkbox
            checked={uncategorized}
            onCheckedChange={onToggleUncategorized}
          />
          <span className="text-white/50">Uncategorized</span>
        </label>
        {parents.map((parent) => {
          const kids = childrenByParent.get(parent.id) ?? [];
          if (kids.length === 0) return null;
          return (
            <div key={parent.id}>
              <div className="px-2 pt-2.5 pb-1 text-11 font-semibold tracking-wide text-white/40">
                {parent.name}
              </div>
              {kids.map((cat) => (
                <label key={cat.id} className={OPTION_CLASS}>
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
    <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
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
            "h-full rounded-md px-2.5 text-12 font-medium transition-colors duration-150",
            value === opt.value
              ? "bg-white/12 text-white/90"
              : "text-white/50 hover:bg-white/[0.06] hover:text-white/85",
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
        CHIP_CLASS,
        "px-2.5",
        value === true ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS,
      )}
    >
      <Briefcase
        className={cn("size-3.5", value === true && "text-primary-300")}
      />
      Business
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
    <div className="relative w-full min-w-0 sm:w-48">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/35" />
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search…"
        className="pr-7 pl-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/40 transition-colors duration-150 hover:bg-white/10 hover:text-white/85"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

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
        <button
          type="button"
          className="flex h-8 items-center gap-1 rounded-md px-2 text-12 font-medium text-white/45 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/85"
          onClick={() => {
            setSearchValue("");
            onFiltersChange({});
          }}
        >
          <X className="size-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}

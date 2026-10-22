import type {
  CategorySchema,
  NameSuggestion,
  TransactionSchema,
} from "@bessel/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@bessel/ui/components/sheet";
import { Switch } from "@bessel/ui/components/switch";
import { format } from "date-fns";
import { type ReactNode, useState } from "react";
import { CategoryCell } from "@/components/category-cell";
import { TransactionDocuments } from "@/components/transactions/transaction-documents";
import {
  filedAs,
  signedAmount,
  type TransactionHandlers,
  TransactionIcon,
} from "@/components/transactions/transaction-list";
import {
  NameHeading,
  NameSuggestions,
  NoteField,
} from "@/components/transactions/transaction-naming";
import { SoftButton } from "@/components/ui-kit";
import { Amount } from "@/lib/privacy";
import { cn } from "@/lib/utils";

/** One transaction up close, with everything the list's row offers, for any screen size. */
export function TransactionPanel({
  transaction,
  account,
  categories,
  handlers,
  onOpenChange,
}: {
  transaction: TransactionSchema | null;
  account: string | undefined;
  categories: CategorySchema[];
  handlers: TransactionHandlers;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!transaction} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Escape while typing leaves the field first; the next one closes the panel.
        onEscapeKeyDown={(event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest("input, textarea")
          ) {
            event.preventDefault();
          }
        }}
        className="w-full gap-0 overflow-y-auto border-white/10 bg-panel p-0 sm:max-w-md"
      >
        {transaction && (
          <Body
            key={transaction.id}
            transaction={transaction}
            account={account}
            categories={categories}
            handlers={handlers}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  transaction,
  account,
  categories,
  handlers,
  onClose,
}: {
  transaction: TransactionSchema;
  account: string | undefined;
  categories: CategorySchema[];
  handlers: TransactionHandlers;
  onClose: () => void;
}) {
  const credit = transaction.direction === "credit";
  const business = transaction.is_business ?? false;
  const [suggestions, setSuggestions] = useState<NameSuggestion[]>([]);
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 border-b border-white/[0.06] px-5 pt-5 pr-12 pb-4">
        <TransactionIcon
          logo={transaction.logo_url}
          kind={transaction.investment_kind}
          category={categories.find((c) => c.id === transaction.category_id)}
          transfer={!!transaction.transfer_id}
        />
        <div className="min-w-0 flex-1">
          <NameHeading
            transaction={transaction}
            onSuggestions={setSuggestions}
            renderTitle={(title) => (
              <SheetTitle className="min-w-0 type-heading text-white/90">
                {title}
              </SheetTitle>
            )}
          />
          <SheetDescription className="type-caption text-white/45">
            {format(transaction.transaction_date, "EEEE d MMMM yyyy")}
          </SheetDescription>
        </div>
      </header>

      <div className="space-y-6 px-5 py-5">
        {transaction.name && (
          <NameSuggestions
            name={transaction.name}
            description={transaction.description}
            suggestions={suggestions}
            onDone={(description) =>
              setSuggestions((current) =>
                current.filter((s) => s.description !== description),
              )
            }
          />
        )}
        <Amount
          value={signedAmount(transaction)}
          currency={transaction.currency}
          sign
          exact
          className={cn(
            "block type-display",
            credit ? "text-income" : "text-white",
          )}
        />

        <dl className="space-y-1">
          <Detail label="Account">{account ?? "Unknown account"}</Detail>
          <Detail
            label={transaction.investment_kind ? "What it is" : "Category"}
          >
            {transaction.transfer_id || transaction.investment_kind ? (
              <span className="text-13 text-white/60">
                {filedAs(
                  transaction,
                  categories.find((c) => c.id === transaction.category_id),
                )}
              </span>
            ) : (
              <CategoryCell
                transactionId={transaction.id}
                categoryId={transaction.category_id}
                description={transaction.description}
                categories={categories}
                onBulkSuggestion={handlers.onBulkSuggestion}
              />
            )}
          </Detail>
          <Detail
            label="Company expense"
            hint="Your company's cost, kept out of your own spending."
          >
            <Switch
              checked={business}
              onCheckedChange={(on) =>
                handlers.onToggleBusiness(transaction.id, on)
              }
              aria-label="Company expense"
            />
          </Detail>
        </dl>

        <NoteField transaction={transaction} />

        <TransactionDocuments transactionId={transaction.id} />

        {transaction.transfer_id && (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
            <p className="text-13 text-white/80">Moved between your accounts</p>
            <p className="mt-0.5 type-caption text-white/45">
              It counts as neither money in nor money out.
            </p>
            <SoftButton
              className="mt-3"
              onClick={() => handlers.onUnpair(transaction.id)}
            >
              It's not - count it
            </SoftButton>
          </div>
        )}
      </div>

      <footer className="mt-auto border-t border-white/[0.06] px-5 py-4">
        <button
          type="button"
          onClick={() => {
            onClose();
            handlers.onDelete([transaction.id]);
          }}
          className="text-12 font-medium text-rose-300/80 transition-colors hover:text-rose-300"
        >
          Delete transaction
        </button>
      </footer>
    </div>
  );
}

function Detail({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 py-1.5">
      <dt className="min-w-0 flex-1">
        <span className="block text-13 text-white/60">{label}</span>
        {hint && <span className="type-caption text-white/35">{hint}</span>}
      </dt>
      <dd className="flex max-w-[60%] shrink-0 justify-end">{children}</dd>
    </div>
  );
}

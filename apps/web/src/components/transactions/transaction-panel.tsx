import type { CategorySchema, TransactionSchema } from "@bessel/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@bessel/ui/components/sheet";
import { Switch } from "@bessel/ui/components/switch";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { CategoryCell } from "@/components/category-cell";
import {
  signedAmount,
  type TransactionHandlers,
} from "@/components/transactions/transaction-list";
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
        className="w-full gap-0 overflow-y-auto border-white/10 bg-panel p-0 sm:max-w-md"
      >
        {transaction && (
          <Body
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
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-white/[0.06] px-5 pt-5 pr-12 pb-4">
        <SheetTitle className="type-heading text-white/90">
          {transaction.description ?? "No description"}
        </SheetTitle>
        <SheetDescription className="type-caption text-white/45">
          {format(transaction.transaction_date, "EEEE d MMMM yyyy")}
        </SheetDescription>
      </header>

      <div className="space-y-6 px-5 py-5">
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
          <Detail label="Category">
            {transaction.transfer_id ? (
              <span className="text-13 text-white/60">
                Between your accounts
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

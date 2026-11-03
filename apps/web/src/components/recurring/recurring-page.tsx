import type {
  RecurringKind,
  RecurringSeriesSchema,
  RecurringTotal,
  UpcomingPayment,
} from "@bessel/client";
import { listBankAccountsOptions } from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@bessel/ui/components/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import { Input } from "@bessel/ui/components/input";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronRight, MoreHorizontal, Repeat } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  placeholderKeys,
  SectionLabel,
  StatTile,
} from "@/components/ui-kit";
import { client } from "@/lib/client";
import { fromApiDate, useLocalDay } from "@/lib/local-day";
import { Amount, HideAmountsButton } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import {
  CADENCE_LABELS,
  dueText,
  KIND_LABELS,
  orderedTotals,
  recentPriceChange,
  type SeriesSections,
  sectionsSummary,
  seriesSections,
} from "./recurring-utils";
import {
  BADGE,
  CompanyBadge,
  signedAmount,
  UpcomingList,
} from "./upcoming-list";
import { type Review, useRecurring, useReviewSeries } from "./use-recurring";

function useAccountNames(): Map<string, string> {
  const { data } = useQuery(
    listBankAccountsOptions({ client, query: { limit: 100 } }),
  );
  return new Map((data?.items ?? []).map((a) => [a.id, a.name]));
}

function SeriesIcon({
  name,
  kind,
  logo,
}: {
  name: string;
  kind: RecurringKind;
  logo?: string | null;
}) {
  const [broken, setBroken] = useState(false);
  if (logo && !broken) {
    return (
      <span className="flex size-8 shrink-0 overflow-hidden rounded-full bg-white">
        <img
          src={logo}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setBroken(true)}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-12 font-medium",
        kind === "subscription" && "bg-primary-500/15 text-primary-300",
        kind === "bill" && "bg-white/[0.06] text-white/60",
        kind === "income" && "bg-income/15 text-income",
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function LateBadge() {
  return (
    <span
      className={cn(
        BADGE,
        "border-amber-500/25 bg-amber-500/10 text-amber-300",
      )}
    >
      Late
    </span>
  );
}

/** Each currency's month on its own, your money first and the company's after. */
function Totals({ totals }: { totals: RecurringTotal[] }) {
  if (totals.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {orderedTotals(totals).map((total) => (
        <div
          key={`${total.currency}-${total.is_business}`}
          className="grid grid-cols-1 gap-2 @md:grid-cols-3"
        >
          <StatTile
            label={
              total.is_business
                ? "Company bills and subscriptions a month"
                : "Bills and subscriptions a month"
            }
            value={<Amount value={total.money_out} currency={total.currency} />}
          />
          <StatTile
            label="Of which subscriptions"
            value={
              <Amount value={total.subscriptions} currency={total.currency} />
            }
          />
          <StatTile
            label={
              total.is_business ? "Company income a month" : "Income a month"
            }
            value={<Amount value={total.money_in} currency={total.currency} />}
          />
        </div>
      ))}
    </div>
  );
}

function RenameDialog({
  series,
  onClose,
  onRename,
}: {
  series: RecurringSeriesSchema | null;
  onClose: () => void;
  onRename: (series: RecurringSeriesSchema, name: string | null) => void;
}) {
  const form = useForm({
    defaultValues: { name: series?.name ?? "" },
    onSubmit: ({ value }) => {
      if (!series) return;
      const name = value.name.trim();
      onRename(series, name && name !== series.detected_name ? name : null);
      onClose();
    },
  });
  return (
    <Dialog open={!!series} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>
            Only here: the transactions keep their own names.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="name">
            {(field) => (
              <Input
                aria-label="Name"
                autoFocus
                maxLength={120}
                placeholder={series?.detected_name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SeriesMenu({
  series,
  onReview,
  onRename,
}: {
  series: RecurringSeriesSchema;
  onReview: (review: Review) => void;
  onRename: () => void;
}) {
  const dismissed = series.decision === "dismissed";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton aria-label={`More for ${series.name}`}>
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {series.decision !== "confirmed" && !dismissed && (
          <DropdownMenuItem
            onSelect={() => onReview({ decision: "confirmed" })}
          >
            Confirm it repeats
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Kind</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={series.kind}
              onValueChange={(kind) =>
                onReview({ kind: kind as RecurringKind })
              }
            >
              {(Object.keys(KIND_LABELS) as RecurringKind[]).map((kind) => (
                <DropdownMenuRadioItem key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {dismissed ? (
          <DropdownMenuItem onSelect={() => onReview({ decision: null })}>
            Show again
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() => onReview({ decision: "dismissed" })}
          >
            Not recurring
          </DropdownMenuItem>
        )}
        {series.review_id && (
          <DropdownMenuItem onSelect={() => onReview(null)}>
            Undo my changes
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function seriesCaption(
  series: RecurringSeriesSchema,
  account: string | undefined,
  today: string,
): string {
  const when =
    series.status === "ended" || !series.next_date
      ? `Last ${format(fromApiDate(series.last_date), "d MMM yyyy")}`
      : series.status === "late"
        ? `Was due ${format(fromApiDate(series.next_date), "d MMM")}`
        : dueText(series.next_date, today);
  return [CADENCE_LABELS[series.cadence], account, when]
    .filter(Boolean)
    .join(" - ");
}

function SeriesRow({
  series,
  account,
  today,
  onReview,
  onRename,
}: {
  series: RecurringSeriesSchema;
  account: string | undefined;
  today: string;
  onReview: (review: Review) => void;
  onRename: () => void;
}) {
  const change = recentPriceChange(series);
  const credit = series.direction === "credit";
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <SeriesIcon
        name={series.name}
        kind={series.kind}
        logo={series.logo_url}
      />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate text-13 font-medium text-white/85">
            {series.name}
          </span>
          {series.is_business && <CompanyBadge />}
          {series.status === "late" && <LateBadge />}
          {change && (
            <span
              className={cn(
                BADGE,
                "border-white/10 bg-white/[0.04] text-white/60",
              )}
            >
              {change.new_amount > change.old_amount ? "Up" : "Down"} from{" "}
              <Amount
                value={change.old_amount}
                currency={series.currency}
                exact
              />
            </span>
          )}
        </p>
        <p className="truncate type-caption text-white/45">
          {seriesCaption(series, account, today)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <Amount
          value={signedAmount(series.direction, series.typical_amount)}
          currency={series.currency}
          sign
          exact
          className={cn(
            "block text-13 font-medium",
            credit ? "text-income" : "text-white/80",
          )}
        />
        <span className="type-caption text-white/40">
          {series.variable ? "Varies" : CADENCE_LABELS[series.cadence]}
        </span>
      </div>
      <SeriesMenu series={series} onReview={onReview} onRename={onRename} />
    </li>
  );
}

function SeriesList({
  title,
  series,
  accounts,
  today,
  highlight,
  onReview,
  onRename,
}: {
  title: ReactNode;
  series: RecurringSeriesSchema[];
  accounts: Map<string, string>;
  today: string;
  highlight?: boolean;
  onReview: (series: RecurringSeriesSchema, review: Review) => void;
  onRename: (series: RecurringSeriesSchema) => void;
}) {
  if (series.length === 0) return null;
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <Panel
        className={cn(
          highlight && "border-primary-500/25 bg-primary-500/[0.04]",
        )}
      >
        <ul className="divide-y divide-white/[0.06]">
          {series.map((s) => (
            <SeriesRow
              key={`${s.key}-${s.typical_amount}`}
              series={s}
              account={accounts.get(s.bank_account_id)}
              today={today}
              onReview={(review) => onReview(s, review)}
              onRename={() => onRename(s)}
            />
          ))}
        </ul>
      </Panel>
    </section>
  );
}

function Folded({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-13 text-white/50 hover:text-white/80">
        <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2.5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-2">
      {placeholderKeys(4).map((key) => (
        <Skeleton key={key} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}

function RecurringBody({
  sections,
  upcoming,
  totals,
  today,
}: {
  sections: SeriesSections;
  upcoming: UpcomingPayment[];
  totals: RecurringTotal[];
  today: string;
}) {
  const accounts = useAccountNames();
  const review = useReviewSeries();
  const [renaming, setRenaming] = useState<RecurringSeriesSchema | null>(null);
  const lists = {
    accounts,
    today,
    onReview: review,
    onRename: setRenaming,
  };
  return (
    <>
      <Totals totals={totals} />
      <section>
        <SectionLabel>Next 30 days</SectionLabel>
        {upcoming.length ? (
          <Panel className="p-4">
            <UpcomingList payments={upcoming} today={today} />
          </Panel>
        ) : (
          <p className="text-13 text-white/45">
            Nothing due in the next 30 days.
          </p>
        )}
      </section>
      <SeriesList
        title="Subscriptions"
        series={sections.subscriptions}
        highlight
        {...lists}
      />
      <SeriesList title="Bills" series={sections.bills} {...lists} />
      <SeriesList title="Income" series={sections.income} {...lists} />
      {sections.ended.length > 0 && (
        <Folded title={`Ended (${sections.ended.length})`}>
          <SeriesList
            title="Stopped coming"
            series={sections.ended}
            {...lists}
          />
        </Folded>
      )}
      {sections.dismissed.length > 0 && (
        <Folded title={`Not recurring (${sections.dismissed.length})`}>
          <SeriesList
            title="You said these don't repeat"
            series={sections.dismissed}
            {...lists}
          />
        </Folded>
      )}
      <RenameDialog
        key={renaming ? `${renaming.key}-${renaming.typical_amount}` : "none"}
        series={renaming}
        onClose={() => setRenaming(null)}
        onRename={(series, name) => review(series, { name })}
      />
    </>
  );
}

/** Bills, subscriptions and income that repeat, found in the transactions, with what's due next. */
export function RecurringPage() {
  const today = useLocalDay();
  const { data, isLoading } = useRecurring();
  const sections = data ? seriesSections(data.series) : null;
  const empty = data && data.series.length === 0;
  return (
    <div className="@container mx-auto flex w-full max-w-4xl flex-col gap-5">
      <PageHeader
        title="Recurring"
        summary={sections ? sectionsSummary(sections) : undefined}
      >
        <HideAmountsButton />
      </PageHeader>
      {isLoading && <Loading />}
      {empty && (
        <EmptyState icon={<Repeat />} title="Nothing that repeats yet">
          Bills, subscriptions and income show up here after a few payments on
          the same schedule.
        </EmptyState>
      )}
      {data && sections && !empty && (
        <RecurringBody
          sections={sections}
          upcoming={data.upcoming}
          totals={data.totals}
          today={today}
        />
      )}
    </div>
  );
}

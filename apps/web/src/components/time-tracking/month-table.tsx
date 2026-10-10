import { format } from "date-fns";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { copyText } from "@/lib/task-format";
import { cn } from "@/lib/utils";
import {
  amountFor,
  formatAmount,
  formatHours,
  type MonthRow,
  monthText,
} from "./time-format";

const MONTHS = Array.from({ length: 12 }, (_, i) => i);

function hoursCell(seconds: number): string {
  return seconds > 0 ? formatHours(seconds).replace(" h", "") : "";
}

/** Hours per project per month for one year; a cell opens that month. */
export function MonthTable({
  year,
  rows,
  currentMonth,
  onOpenMonth,
}: {
  year: number;
  rows: MonthRow[];
  /** Highlighted column, when `year` is this year. */
  currentMonth: number | null;
  onOpenMonth: (month: number) => void;
}) {
  const monthTotals = MONTHS.map((m) =>
    rows.reduce((sum, row) => sum + row.months[m], 0),
  );
  const yearTotal = monthTotals.reduce((a, b) => a + b, 0);

  const copyMonth = (month: number) => {
    void copyText(monthText(rows, year, month)).then(() =>
      toast.success(`Copied ${format(new Date(year, month, 1), "MMMM")} hours`),
    );
  };

  const column = (m: number) => cn(m === currentMonth && "bg-white/[0.03]");

  return (
    <div className="overflow-x-auto rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
      <table className="w-full min-w-[760px] border-collapse text-12 tabular-nums">
        <thead>
          <tr className="text-white/45">
            <th className="sticky left-0 z-10 bg-[color-mix(in_oklab,var(--background)_96%,white)] px-4 py-2.5 text-left font-medium">
              Project
            </th>
            {MONTHS.map((m) => (
              <th key={m} className={cn("px-1 py-1.5 font-medium", column(m))}>
                <button
                  type="button"
                  title={`Copy ${format(new Date(year, m, 1), "MMMM")} hours`}
                  disabled={monthTotals[m] === 0}
                  onClick={() => copyMonth(m)}
                  className="group/month inline-flex h-6 items-center gap-1 rounded-md px-1.5 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/80 disabled:pointer-events-none"
                >
                  {format(new Date(year, m, 1), "MMM")}
                  <Copy className="size-3 opacity-0 transition-opacity duration-150 group-hover/month:opacity-100" />
                </button>
              </th>
            ))}
            <th className="px-4 py-2.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ project, months, total }) => {
            const amount = amountFor(project, total);
            return (
              <tr key={project.id} className="border-t border-white/[0.05]">
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-48 bg-[color-mix(in_oklab,var(--background)_96%,white)] px-4 py-2 text-left font-normal"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: project.color }}
                    />
                    <span
                      className={cn(
                        "truncate",
                        project.archived_at ? "text-white/45" : "text-white/85",
                      )}
                    >
                      {project.name}
                    </span>
                  </span>
                </th>
                {MONTHS.map((m) => (
                  <td key={m} className={cn("p-0 text-center", column(m))}>
                    {months[m] > 0 && (
                      <button
                        type="button"
                        title={`Open ${format(new Date(year, m, 1), "MMMM")}`}
                        onClick={() => onOpenMonth(m)}
                        className="h-8 w-full text-white/75 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
                      >
                        {hoursCell(months[m])}
                      </button>
                    )}
                  </td>
                ))}
                <td className="px-4 py-2 text-right">
                  <span className="font-medium text-white/90">
                    {formatHours(total)}
                  </span>
                  {amount !== null && total > 0 && (
                    <span className="block text-11 text-white/40">
                      {formatAmount(amount, project.currency)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/[0.1] text-white/60">
            <th
              scope="row"
              className="sticky left-0 z-10 bg-[color-mix(in_oklab,var(--background)_96%,white)] px-4 py-2.5 text-left font-medium"
            >
              Total
            </th>
            {MONTHS.map((m) => (
              <td
                key={m}
                className={cn("px-1 py-2.5 text-center font-medium", column(m))}
              >
                {hoursCell(monthTotals[m])}
              </td>
            ))}
            <td className="px-4 py-2.5 text-right font-semibold text-white/90">
              {formatHours(yearTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

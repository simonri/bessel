import type { ExportTransactionsData } from "@bessel/client";
import {
  exportTransactions,
  exportTransactionsWithReceipts,
} from "@bessel/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import { ChevronDown, Download, FileArchive, Sheet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { TransactionFilters } from "@/components/transaction-filters";
import { SoftButton } from "@/components/ui-kit";
import { client } from "@/lib/client";

type ExportQuery = NonNullable<ExportTransactionsData["query"]>;

/** What the downloaded file is called, without its extension: the month it
 *  covers, or that it's a search, which covers every month. */
export function exportFileName(
  filters: TransactionFilters,
  firstDay: string,
): string {
  const owner = filters.is_business ? "company-transactions" : "transactions";
  return `${owner}-${filters.search ? "search" : firstDay.slice(0, 7)}`;
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), {
    href: url,
    download: fileName,
  }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const item =
  "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors data-[highlighted]:bg-white/[0.06]";

// The API wants the bearer token, which a plain link can't send, so the file
// comes through the authenticated client and is saved from a blob.
export function TransactionExportMenu({
  query,
  fileName,
}: {
  query: ExportQuery;
  fileName: string;
}) {
  const [busy, setBusy] = useState(false);

  const download = async (withReceipts: boolean) => {
    setBusy(true);
    try {
      const { data } = withReceipts
        ? await exportTransactionsWithReceipts({
            client,
            query,
            parseAs: "blob",
          })
        : await exportTransactions({ client, query, parseAs: "blob" });
      if (!(data instanceof Blob)) {
        toast.error("Couldn't export the transactions");
        return;
      }
      save(
        data,
        withReceipts ? `${fileName}-with-receipts.zip` : `${fileName}.csv`,
      );
    } catch {
      toast.error("Couldn't export the transactions");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SoftButton disabled={busy}>
          <Download />
          {busy ? "Exporting…" : "Export"}
          <ChevronDown className="text-white/45" />
        </SoftButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-72 rounded-xl border-white/10 bg-popover p-1 shadow-2xl"
      >
        <DropdownMenuItem
          className={item}
          onSelect={() => void download(false)}
        >
          <Sheet className="mt-0.5 size-3.5 shrink-0 text-white/50" />
          <span className="flex flex-col gap-0.5">
            <span className="text-13 text-white/85">Spreadsheet</span>
            <span className="text-11 text-white/40">
              A CSV of what's listed - opens in Excel and Google Sheets
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => void download(true)}>
          <FileArchive className="mt-0.5 size-3.5 shrink-0 text-white/50" />
          <span className="flex flex-col gap-0.5">
            <span className="text-13 text-white/85">With receipts</span>
            <span className="text-11 text-white/40">
              A zip of the CSV and every invoice and receipt, for your
              bookkeeper
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

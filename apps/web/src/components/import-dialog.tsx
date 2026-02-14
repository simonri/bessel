import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@metron/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metron/ui/components/dialog";
import { Input } from "@metron/ui/components/input";
import { Label } from "@metron/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metron/ui/components/select";
import {
  importTransactionsV1TransactionsImportPostMutation,
  listTransactionsV1TransactionsGetQueryKey,
  listBankAccountsV1BankAccountsGetOptions,
} from "@metron/client";
import { client } from "@/lib/client";

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: accountsData } = useQuery(
    listBankAccountsV1BankAccountsGetOptions({
      client,
      query: { limit: 100, sorting: ["name"] },
    }),
  );
  const accounts = accountsData?.items ?? [];

  const mutation = useMutation({
    ...importTransactionsV1TransactionsImportPostMutation({ client }),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({
        queryKey: listTransactionsV1TransactionsGetQueryKey({ client }),
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !bankAccountId) return;

    setResult(null);
    mutation.mutate({
      client,
      body: { file },
      query: {
        bank: "marginalen",
        bank_account_id: bankAccountId,
      },
    });
  };

  const handleClose = () => {
    setOpen(false);
    setFile(null);
    setBankAccountId("");
    setResult(null);
    mutation.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="size-4" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Transactions</DialogTitle>
          <DialogDescription>
            Upload a bank CSV export to import transactions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bank-account">Bank Account</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger id="bank-account" className="w-full">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} ({account.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input
              id="csv-file"
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </div>

          {result && (
            <div className="text-sm rounded-md border p-3">
              <p>
                <span className="font-medium">{result.created}</span>{" "}
                transactions imported
              </p>
              <p>
                <span className="font-medium">{result.skipped}</span>{" "}
                duplicates skipped
              </p>
            </div>
          )}

          {mutation.isError && (
            <p className="text-destructive text-sm">
              Import failed. Please check the file and try again.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
            >
              {result ? "Done" : "Cancel"}
            </Button>
            {!result && (
              <Button type="submit" disabled={mutation.isPending || !file || !bankAccountId}>
                {mutation.isPending ? "Importing..." : "Import"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

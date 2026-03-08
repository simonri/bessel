import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
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

const BANK_OPTIONS = [
  { value: "marginalen", label: "Marginalen", accept: ".csv" },
  { value: "skandiabanken", label: "Skandiabanken", accept: ".xlsx" },
] as const;

export function ImportDialog() {
  const [open, setOpen] = useState(false);
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

  const form = useForm({
    defaultValues: {
      file: null as File | null,
      bank: "" as string,
      bankAccountId: "",
    },
    onSubmit: ({ value }) => {
      if (!value.file || !value.bankAccountId || !value.bank) return;

      setResult(null);
      mutation.mutate({
        client,
        body: { file: value.file },
        query: {
          bank: value.bank,
          bank_account_id: value.bankAccountId,
        },
      });
    },
  });

  const handleClose = () => {
    setOpen(false);
    form.reset();
    setResult(null);
    mutation.reset();
  };

  const selectedBank = BANK_OPTIONS.find((b) => b.value === form.getFieldValue("bank"));
  const fileAccept = selectedBank?.accept ?? ".csv,.xlsx";

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
            Upload a bank export to import transactions.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field
            name="bank"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="bank">Bank</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => {
                    field.handleChange(v);
                    // Clear file when bank changes since accept type differs
                    form.setFieldValue("file", null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  <SelectTrigger id="bank" className="w-full">
                    <SelectValue placeholder="Select a bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_OPTIONS.map((bank) => (
                      <SelectItem key={bank.value} value={bank.value}>
                        {bank.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />

          <form.Field
            name="bankAccountId"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="bank-account">Bank Account</Label>
                <Select value={field.state.value} onValueChange={field.handleChange}>
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
            )}
          />

          <form.Field
            name="file"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="import-file">File</Label>
                <Input
                  id="import-file"
                  ref={fileInputRef}
                  type="file"
                  accept={fileAccept}
                  onChange={(e) => field.handleChange(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
            )}
          />

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
              <form.Subscribe
                selector={(state) => [state.values.file, state.values.bankAccountId, state.values.bank] as const}
                children={([file, bankAccountId, bank]) => (
                  <Button type="submit" disabled={mutation.isPending || !file || !bankAccountId || !bank}>
                    {mutation.isPending ? "Importing..." : "Import"}
                  </Button>
                )}
              />
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

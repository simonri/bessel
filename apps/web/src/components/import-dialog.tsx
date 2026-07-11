import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Upload } from "lucide-react";
import { Button } from "@bessel/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@bessel/ui/components/dialog";
import { Input } from "@bessel/ui/components/input";
import { Label } from "@bessel/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import {
  importTransactionsV1TransactionsImportPostMutation,
  importKlarnaTransactionsV1KlarnaImportPostMutation,
  listTransactionsV1TransactionsGetQueryKey,
  listBankAccountsV1BankAccountsGetOptions,
} from "@bessel/client";
import { toast } from "sonner";
import { client } from "@/lib/client";

const FILE_BANKS = [
  { value: "marginalen", label: "Marginalen", accept: ".csv" },
  { value: "skandiabanken", label: "Skandiabanken", accept: ".xlsx" },
] as const;

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: accountsData } = useQuery(
    listBankAccountsV1BankAccountsGetOptions({ client, query: { limit: 100, sorting: ["name"] } }),
  );
  const accounts = accountsData?.items ?? [];

  const fileMutation = useMutation({
    ...importTransactionsV1TransactionsImportPostMutation({ client }),
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: listTransactionsV1TransactionsGetQueryKey({ client }) });
      toast.success(`${data.created} transactions imported`);
    },
    onError: () => toast.error("Import failed"),
  });

  const klarnaMutation = useMutation({
    ...importKlarnaTransactionsV1KlarnaImportPostMutation({ client }),
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: listTransactionsV1TransactionsGetQueryKey({ client }) });
      toast.success(`${data.created} transactions imported`);
    },
    onError: () => toast.error("Klarna import failed"),
  });

  const isPending = fileMutation.isPending || klarnaMutation.isPending;

  const form = useForm({
    defaultValues: {
      source: "" as string,
      bankAccountId: "",
      file: null as File | null,
      klarnaToken: "",
      klarnaCookie: "",
    },
    onSubmit: ({ value }) => {
      if (!value.bankAccountId || !value.source) return;
      setResult(null);

      if (value.source === "klarna") {
        const bearer = value.klarnaToken.trim().startsWith("Bearer ")
          ? value.klarnaToken.trim()
          : `Bearer ${value.klarnaToken.trim()}`;
        klarnaMutation.mutate({
          client,
          body: {
            bank_account_id: value.bankAccountId,
            authorization: bearer,
            cookie: value.klarnaCookie.trim() || null,
          },
        });
      } else {
        if (!value.file) return;
        fileMutation.mutate({
          client,
          body: { file: value.file },
          query: { bank: value.source, bank_account_id: value.bankAccountId },
        });
      }
    },
  });

  const handleClose = () => {
    setOpen(false);
    form.reset();
    setResult(null);
    fileMutation.reset();
    klarnaMutation.reset();
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
          <DialogDescription>Import from a bank export file or your Klarna account.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }}
          className="space-y-4"
        >
          {/* Source */}
          <form.Field
            name="source"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="source">Source <span className="text-destructive">*</span></Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => {
                    field.handleChange(v);
                    form.setFieldValue("file", null);
                    form.setFieldValue("klarnaToken", "");
                    form.setFieldValue("klarnaCookie", "");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <SelectTrigger id="source" className="w-full">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {FILE_BANKS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                    ))}
                    <SelectItem value="klarna">Klarna</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          />

          {/* Account */}
          <form.Field
            name="bankAccountId"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="bank-account">Account <span className="text-destructive">*</span></Label>
                <Select value={field.state.value} onValueChange={field.handleChange}>
                  <SelectTrigger id="bank-account" className="w-full">
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />

          {/* File — shown for file-based banks */}
          <form.Subscribe
            selector={(s) => s.values.source}
            children={(source) =>
              source && source !== "klarna" ? (
                <form.Field
                  name="file"
                  children={(field) => {
                    const bank = FILE_BANKS.find((b) => b.value === source);
                    return (
                      <div className="space-y-2">
                        <Label htmlFor="import-file">File <span className="text-destructive">*</span></Label>
                        <Input
                          id="import-file"
                          ref={fileInputRef}
                          type="file"
                          accept={bank?.accept ?? ".csv,.xlsx"}
                          onChange={(e) => field.handleChange(e.target.files?.[0] ?? null)}
                        />
                      </div>
                    );
                  }}
                />
              ) : null
            }
          />

          {/* Klarna credentials — shown only when Klarna is selected */}
          <form.Subscribe
            selector={(s) => s.values.source}
            children={(source) =>
              source === "klarna" ? (
                <div className="space-y-3">
                  <form.Field
                    name="klarnaToken"
                    children={(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor="klarna-token">
                          Authorization header <span className="text-destructive">*</span>
                        </Label>
                        <textarea
                          id="klarna-token"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="eyJhbGciOi…"
                          rows={2}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                      </div>
                    )}
                  />
                  <form.Field
                    name="klarnaCookie"
                    children={(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor="klarna-cookie">Cookie header</Label>
                        <textarea
                          id="klarna-cookie"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="sessionId=…; kdid=…"
                          rows={2}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                      </div>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Devtools → Network → any Klarna request → Headers tab
                  </p>
                </div>
              ) : null
            }
          />

          {result && (
            <div className="text-sm rounded-md border p-3 space-y-0.5">
              <p><span className="font-medium">{result.created}</span> transactions imported</p>
              <p><span className="font-medium">{result.skipped}</span> duplicates skipped</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {result ? "Done" : "Cancel"}
            </Button>
            {!result && (
              <form.Subscribe
                selector={(s) => s.values}
                children={(values) => {
                  const isKlarna = values.source === "klarna";
                  const ready = isKlarna
                    ? !!(values.klarnaToken.trim() && values.bankAccountId)
                    : !!(values.file && values.bankAccountId && values.source);
                  return (
                    <Button type="submit" disabled={isPending || !ready}>
                      {isPending ? "Importing…" : "Import"}
                    </Button>
                  );
                }}
              />
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

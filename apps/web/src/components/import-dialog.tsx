import {
  getAccountsOverviewV1BankAccountsOverviewGetQueryKey,
  getNetWorthHistoryV1BankAccountsNetWorthGetQueryKey,
  importKlarnaTransactionsV1KlarnaImportPostMutation,
  importTransactionsV1TransactionsImportPostMutation,
  listBankAccountsV1BankAccountsGetOptions,
  listBankAccountsV1BankAccountsGetQueryKey,
  listTransactionsV1TransactionsGetQueryKey,
} from "@bessel/client";
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
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { client } from "@/lib/client";
import { formatKr } from "@/lib/money";

export const FILE_BANKS = [
  { value: "marginalen", label: "Marginalen", accept: ".csv" },
  { value: "skandiabanken", label: "Skandiabanken", accept: ".xlsx" },
] as const;

export interface ImportPreset {
  /** A bank from FILE_BANKS, or "klarna". */
  source?: string | null;
  bankAccountId?: string;
}

/**
 * Imports a bank's export file or Klarna pay later purchases. Pass `open` to
 * control it from elsewhere, with `preset` filling in the source and account.
 */
export function ImportDialog({
  open: openProp,
  onOpenChange,
  preset,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  preset?: ImportPreset;
} = {}) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = (value: boolean) =>
    controlled ? onOpenChange?.(value) : setOpenState(value);
  const [result, setResult] = useState<string[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: accountsData } = useQuery(
    listBankAccountsV1BankAccountsGetOptions({
      client,
      query: { limit: 100, sorting: ["name"] },
    }),
  );
  const accounts = accountsData?.items ?? [];

  const invalidateImported = () => {
    void queryClient.invalidateQueries({
      queryKey: listTransactionsV1TransactionsGetQueryKey({ client }),
    });
    // Account balances are derived from their transactions.
    for (const queryKey of [
      listBankAccountsV1BankAccountsGetQueryKey({ client }),
      getAccountsOverviewV1BankAccountsOverviewGetQueryKey({ client }),
      getNetWorthHistoryV1BankAccountsNetWorthGetQueryKey({ client }),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const fileMutation = useMutation({
    ...importTransactionsV1TransactionsImportPostMutation({ client }),
    onSuccess: (data) => {
      setResult([
        `${data.created} transactions imported`,
        `${data.skipped} duplicates skipped`,
      ]);
      invalidateImported();
      toast.success(`${data.created} transactions imported`);
    },
    onError: () => toast.error("Import failed"),
  });

  const klarnaMutation = useMutation({
    ...importKlarnaTransactionsV1KlarnaImportPostMutation({ client }),
    onSuccess: (data) => {
      setResult([
        `${data.created} pay later purchases imported`,
        `${data.updated} updated after a return`,
        `${data.paid_at_purchase} paid at purchase, already in a bank account or the Klarna balance`,
        `${data.declined} declined card payments left out`,
        `${data.payments} payments imported`,
        ...(data.owed === null
          ? []
          : [
              data.drift
                ? `Klarna says you owe ${formatKr(data.owed)}, Bessel ${formatKr(data.owed + data.drift)}; a purchase or payment is missing`
                : `Matches Klarna: ${formatKr(data.owed)} left to pay`,
            ]),
        ...(data.unrecognized_plans.length
          ? [
              `Imported as pay later, new plans: ${data.unrecognized_plans.join(", ")}`,
            ]
          : []),
      ]);
      invalidateImported();
      toast.success(`${data.created} pay later purchases imported`);
    },
    onError: () => toast.error("Klarna import failed"),
  });

  // The desktop app signs in to Klarna itself, so there's no token to copy.
  const klarnaSignIn = window.electron?.klarna?.signIn;
  const [signingIn, setSigningIn] = useState(false);
  const isPending =
    fileMutation.isPending || klarnaMutation.isPending || signingIn;

  const importFromKlarnaApp = async (bankAccountId: string) => {
    if (!klarnaSignIn) return;
    setSigningIn(true);
    try {
      const credentials = await klarnaSignIn();
      if (!credentials) return;
      klarnaMutation.mutate({
        client,
        body: { bank_account_id: bankAccountId, ...credentials },
      });
    } finally {
      setSigningIn(false);
    }
  };

  const form = useForm({
    defaultValues: {
      source: preset?.source ?? "",
      bankAccountId: preset?.bankAccountId ?? "",
      file: null as File | null,
      klarnaToken: "",
      klarnaCookie: "",
    },
    onSubmit: ({ value }) => {
      if (!value.bankAccountId || !value.source) return;
      setResult(null);

      if (value.source === "klarna" && klarnaSignIn) {
        void importFromKlarnaApp(value.bankAccountId);
      } else if (value.source === "klarna") {
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

  // Opened for another account or source than last time.
  const presetSource = preset?.source ?? "";
  const presetAccount = preset?.bankAccountId ?? "";
  useEffect(() => {
    if (!open) return;
    form.setFieldValue("source", presetSource);
    form.setFieldValue("bankAccountId", presetAccount);
  }, [open, presetSource, presetAccount, form]);

  const handleClose = () => {
    setOpen(false);
    form.reset();
    setResult(null);
    fileMutation.reset();
    klarnaMutation.reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : handleClose())}
    >
      {!controlled && (
        <DialogTrigger asChild>
          <Button>
            <Upload className="size-4" />
            Import
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import transactions</DialogTitle>
          <DialogDescription>
            Import from a bank export file, or your Klarna pay later purchases.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          {/* Source */}
          <form.Field name="source">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="source">
                  Source <span className="text-destructive">*</span>
                </Label>
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
                      <SelectItem key={b.value} value={b.value}>
                        {b.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="klarna">Klarna pay later</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          {/* Account */}
          <form.Field name="bankAccountId">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="bank-account">
                  Account <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={field.state.value}
                  onValueChange={field.handleChange}
                >
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
          </form.Field>

          {/* File — shown for file-based banks */}
          <form.Subscribe selector={(s) => s.values.source}>
            {(source) =>
              source && source !== "klarna" ? (
                <form.Field name="file">
                  {(field) => {
                    const bank = FILE_BANKS.find((b) => b.value === source);
                    return (
                      <div className="space-y-2">
                        <Label htmlFor="import-file">
                          File <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="import-file"
                          ref={fileInputRef}
                          type="file"
                          accept={bank?.accept ?? ".csv,.xlsx"}
                          onChange={(e) =>
                            field.handleChange(e.target.files?.[0] ?? null)
                          }
                        />
                      </div>
                    );
                  }}
                </form.Field>
              ) : null
            }
          </form.Subscribe>

          {/* Klarna credentials — shown only when Klarna is selected */}
          <form.Subscribe selector={(s) => s.values.source}>
            {(source) =>
              source === "klarna" && klarnaSignIn ? (
                <p className="text-12 text-muted-foreground">
                  Klarna opens in a window. Sign in with BankID and Bessel
                  imports your pay later purchases and payments.
                </p>
              ) : source === "klarna" ? (
                <div className="space-y-3">
                  <form.Field name="klarnaToken">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor="klarna-token">
                          Authorization header{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <textarea
                          id="klarna-token"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="eyJhbGciOi…"
                          rows={2}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-12 font-mono text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="klarnaCookie">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor="klarna-cookie">Cookie header</Label>
                        <textarea
                          id="klarna-cookie"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="sessionId=…; kdid=…"
                          rows={2}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-12 font-mono text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                      </div>
                    )}
                  </form.Field>
                  <p className="text-12 text-muted-foreground">
                    Devtools → Network → any Klarna request → Headers tab
                  </p>
                </div>
              ) : null
            }
          </form.Subscribe>

          {result && (
            <div className="text-13 rounded-md border p-3 space-y-0.5">
              {result.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {result ? "Done" : "Cancel"}
            </Button>
            {!result && (
              <form.Subscribe selector={(s) => s.values}>
                {(values) => {
                  const isKlarna = values.source === "klarna";
                  const ready = isKlarna
                    ? !!(
                        values.bankAccountId &&
                        (klarnaSignIn || values.klarnaToken.trim())
                      )
                    : !!(values.file && values.bankAccountId && values.source);
                  return (
                    <Button type="submit" disabled={isPending || !ready}>
                      {signingIn
                        ? "Waiting for Klarna…"
                        : isPending
                          ? "Importing…"
                          : isKlarna && klarnaSignIn
                            ? "Sign in to Klarna"
                            : "Import"}
                    </Button>
                  );
                }}
              </form.Subscribe>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

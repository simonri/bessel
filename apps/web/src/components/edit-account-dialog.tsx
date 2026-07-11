import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Pencil } from "lucide-react";
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
import type { BankAccountSchema } from "@bessel/client";
import {
  updateBankAccountV1BankAccountsBankAccountIdPatchMutation,
  listBankAccountsV1BankAccountsGetQueryKey,
} from "@bessel/client";
import { toast } from "sonner";
import { client } from "@/lib/client";

export function EditAccountDialog({ account }: { account: BankAccountSchema }) {
  const [open, setOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const queryKey = listBankAccountsV1BankAccountsGetQueryKey({ client });

  const mutation = useMutation({
    ...updateBankAccountV1BankAccountsBankAccountIdPatchMutation({ client }),
    onMutate: async ({ path, body }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((a: any) => (a.id === path.bank_account_id ? { ...a, ...body } : a)),
        };
      });
      setOpen(false);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Failed to update account");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const form = useForm({
    defaultValues: {
      name: account.name,
      currency: account.currency,
      subtype: account.subtype,
      baseBalance: String(account.base_balance / 100),
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        client,
        path: { bank_account_id: account.id },
        body: {
          name: value.name,
          currency: value.currency,
          subtype: value.subtype,
          base_balance: Math.round(parseFloat(value.baseBalance) * 100) || 0,
        },
      });
    },
  });

  const handleOpen = () => {
    form.reset({
      name: account.name,
      currency: account.currency,
      subtype: account.subtype,
      baseBalance: String(account.base_balance / 100),
    });
    setOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? handleOpen() : setOpen(false))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Edit">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit Bank Account</DialogTitle>
          <DialogDescription>Update the details for {account.name}.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field
            name="name"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  ref={nameRef}
                  id="edit-name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <form.Field
              name="subtype"
              children={(field) => (
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={field.state.value} onValueChange={(v) => field.handleChange(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">Checking</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                      <SelectItem value="isk">ISK</SelectItem>
                      <SelectItem value="af">AF</SelectItem>
                      <SelectItem value="kf">KF</SelectItem>
                      <SelectItem value="brokerage">Brokerage</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="loan">Loan</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            />

            <form.Field
              name="currency"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="edit-currency">Currency</Label>
                  <Input
                    id="edit-currency"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                    maxLength={3}
                    required
                  />
                </div>
              )}
            />
          </div>

          <form.Field
            name="baseBalance"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-base-balance">Starting Balance</Label>
                <Input
                  id="edit-base-balance"
                  type="number"
                  step="0.01"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          />

          {mutation.isError && (
            <p className="text-destructive text-sm">Failed to update account. Please try again.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.values.name] as const}
              children={([name]) => (
                <Button type="submit" disabled={mutation.isPending || !name.trim()}>
                  {mutation.isPending ? "Saving..." : "Save"}
                </Button>
              )}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import type { BankAccountSchema } from "@bessel/client";
import {
  listBankAccountsV1BankAccountsGetQueryKey,
  updateBankAccountV1BankAccountsBankAccountIdPatchMutation,
} from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
import { Checkbox } from "@bessel/ui/components/checkbox";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ACCOUNT_SUBTYPES } from "@/lib/account-constants";
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
          items: old.items.map((a: any) =>
            a.id === path.bank_account_id ? { ...a, ...body } : a,
          ),
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
      isBusiness: account.is_business,
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        client,
        path: { bank_account_id: account.id },
        body: {
          name: value.name,
          currency: value.currency,
          subtype: value.subtype,
          base_balance:
            Math.round(Number.parseFloat(value.baseBalance) * 100) || 0,
          is_business: value.isBusiness,
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
      isBusiness: account.is_business,
    });
    setOpen(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? handleOpen() : setOpen(false))}
    >
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
          <DialogDescription>
            Update the details for {account.name}.
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
          </form.Field>

          <div className="grid grid-cols-2 gap-4">
            <form.Field name="subtype">
              {(field) => (
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => field.handleChange(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_SUBTYPES.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>

            <form.Field name="currency">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="edit-currency">Currency</Label>
                  <Input
                    id="edit-currency"
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value.toUpperCase())
                    }
                    maxLength={3}
                    required
                  />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="baseBalance">
            {(field) => (
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
          </form.Field>

          <form.Field name="isBusiness">
            {(field) => (
              <label
                htmlFor="edit-is-business"
                className="flex items-start gap-2 text-13"
              >
                <Checkbox
                  id="edit-is-business"
                  checked={field.state.value}
                  onCheckedChange={(checked) =>
                    field.handleChange(checked === true)
                  }
                />
                <span>
                  Company account
                  <span className="block text-muted-foreground text-12">
                    Its money isn't your own income or spending. Money between
                    it and your accounts counts as income or spending.
                  </span>
                </span>
              </label>
            )}
          </form.Field>

          {mutation.isError && (
            <p className="text-destructive text-13">
              Failed to update account. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <form.Subscribe selector={(state) => [state.values.name] as const}>
              {([name]) => (
                <Button
                  type="submit"
                  disabled={mutation.isPending || !name.trim()}
                >
                  {mutation.isPending ? "Saving..." : "Save"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

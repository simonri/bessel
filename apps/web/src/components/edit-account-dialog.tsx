import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Pencil } from "lucide-react";
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
import type { BankAccountSchema } from "@metron/client";
import {
  updateBankAccountV1BankAccountsBankAccountIdPatchMutation,
  listBankAccountsV1BankAccountsGetQueryKey,
} from "@metron/client";
import { client } from "@/lib/client";

export function EditAccountDialog({ account }: { account: BankAccountSchema }) {
  const [open, setOpen] = useState(false);
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
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const form = useForm({
    defaultValues: {
      name: account.name,
      currency: account.currency,
      subtype: account.subtype,
      baseBalance: String(account.base_balance),
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        client,
        path: { bank_account_id: account.id },
        body: {
          name: value.name,
          currency: value.currency,
          subtype: value.subtype,
          base_balance: parseInt(value.baseBalance, 10) || 0,
        },
      });
    },
  });

  const handleOpen = () => {
    form.reset({
      name: account.name,
      currency: account.currency,
      subtype: account.subtype,
      baseBalance: String(account.base_balance),
    });
    setOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? handleOpen() : setOpen(false))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Bank Account</DialogTitle>
          <DialogDescription>
            Update the bank account details.
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
            name="name"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  required
                />
              </div>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <form.Field
              name="currency"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="edit-currency">Currency</Label>
                  <Input
                    id="edit-currency"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    maxLength={3}
                    required
                  />
                </div>
              )}
            />

            <form.Field
              name="subtype"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="edit-subtype">Type</Label>
                  <Input
                    id="edit-subtype"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
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
                <Label htmlFor="edit-base-balance">Base Balance (minor units)</Label>
                <Input
                  id="edit-base-balance"
                  type="number"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  required
                />
              </div>
            )}
          />

          {mutation.isError && (
            <p className="text-destructive text-sm">
              Failed to update account. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.values.name] as const}
              children={([name]) => (
                <Button type="submit" disabled={mutation.isPending || !name}>
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

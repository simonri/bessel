import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  const [name, setName] = useState(account.name);
  const [currency, setCurrency] = useState(account.currency);
  const [subtype, setSubtype] = useState(account.subtype);
  const [baseBalance, setBaseBalance] = useState(String(account.base_balance));
  const queryClient = useQueryClient();

  const mutation = useMutation({
    ...updateBankAccountV1BankAccountsBankAccountIdPatchMutation({ client }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: listBankAccountsV1BankAccountsGetQueryKey(),
      });
      setOpen(false);
    },
  });

  const handleOpen = () => {
    setName(account.name);
    setCurrency(account.currency);
    setSubtype(account.subtype);
    setBaseBalance(String(account.base_balance));
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    mutation.mutate({
      client,
      path: { bank_account_id: account.id },
      body: {
        name,
        currency,
        subtype,
        base_balance: parseInt(baseBalance, 10) || 0,
      },
    });
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-currency">Currency</Label>
              <Input
                id="edit-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                maxLength={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-subtype">Type</Label>
              <Input
                id="edit-subtype"
                value={subtype}
                onChange={(e) => setSubtype(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-base-balance">Base Balance (minor units)</Label>
            <Input
              id="edit-base-balance"
              type="number"
              value={baseBalance}
              onChange={(e) => setBaseBalance(e.target.value)}
              required
            />
          </div>

          {mutation.isError && (
            <p className="text-destructive text-sm">
              Failed to update account. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !name}>
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

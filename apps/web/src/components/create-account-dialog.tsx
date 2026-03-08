import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Plus } from "lucide-react";
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
  createBankAccountV1BankAccountsPostMutation,
  listBankAccountsV1BankAccountsGetQueryKey,
} from "@metron/client";
import { client } from "@/lib/client";

export function CreateAccountDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    ...createBankAccountV1BankAccountsPostMutation({ client }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: listBankAccountsV1BankAccountsGetQueryKey({ client }),
      });
      handleClose();
    },
  });

  const form = useForm({
    defaultValues: {
      name: "",
      currency: "SEK",
      subtype: "checking",
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        client,
        body: {
          name: value.name,
          currency: value.currency,
          subtype: value.subtype,
          base_balance: 0,
        },
      });
    },
  });

  const handleClose = () => {
    setOpen(false);
    form.reset();
    mutation.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Bank Account</DialogTitle>
          <DialogDescription>
            Add a new bank account to track transactions.
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
                <Label htmlFor="account-name">Name</Label>
                <Input
                  id="account-name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. Marginalen Savings"
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
                  <Label htmlFor="account-currency">Currency</Label>
                  <Input
                    id="account-currency"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="SEK"
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
                  <Label htmlFor="account-subtype">Type</Label>
                  <Input
                    id="account-subtype"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="e.g. checking, savings"
                    required
                  />
                </div>
              )}
            />
          </div>

          {mutation.isError && (
            <p className="text-destructive text-sm">
              Failed to create account. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.values.name] as const}
              children={([name]) => (
                <Button type="submit" disabled={mutation.isPending || !name}>
                  {mutation.isPending ? "Creating..." : "Create"}
                </Button>
              )}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

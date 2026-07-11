import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Plus } from "lucide-react";
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
  createBankAccountV1BankAccountsPostMutation,
  listBankAccountsV1BankAccountsGetQueryKey,
} from "@bessel/client";
import { toast } from "sonner";
import { client } from "@/lib/client";

export function CreateAccountDialog() {
  const [open, setOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    ...createBankAccountV1BankAccountsPostMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: listBankAccountsV1BankAccountsGetQueryKey({ client }),
      });
      toast.success("Account created");
      handleClose();
    },
    onError: () => {
      toast.error("Failed to create account");
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
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create Bank Account</DialogTitle>
          <DialogDescription>Add a new bank account to track transactions.</DialogDescription>
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
                <Label htmlFor="account-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  ref={nameRef}
                  id="account-name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="e.g. Marginalen Savings"
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
                  <Label htmlFor="account-currency">
                    Currency <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="account-currency"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                    placeholder="SEK"
                    maxLength={3}
                    required
                  />
                </div>
              )}
            />
          </div>

          {mutation.isError && (
            <p className="text-destructive text-sm">Failed to create account. Please try again.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.values.name] as const}
              children={([name]) => (
                <Button type="submit" disabled={mutation.isPending || !name.trim()}>
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

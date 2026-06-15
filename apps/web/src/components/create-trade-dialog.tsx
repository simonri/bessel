import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Plus } from "lucide-react";
import { format } from "date-fns";
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
  createTradeV1InvestmentsTradesPostMutation,
  listTradesV1InvestmentsTradesGetQueryKey,
  listSecuritiesV1InvestmentsSecuritiesGetOptions,
  listBankAccountsV1BankAccountsGetOptions,
  getHoldingsV1InvestmentsHoldingsGetOptions,
} from "@metron/client";
import type { TradeType } from "@metron/client";
import { toast } from "sonner";
import { client } from "@/lib/client";

export function CreateTradeDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: securitiesData } = useQuery({
    ...listSecuritiesV1InvestmentsSecuritiesGetOptions({ client, query: { limit: 100 } }),
    enabled: open,
  });

  const { data: accountsData } = useQuery({
    ...listBankAccountsV1BankAccountsGetOptions({ client, query: { limit: 100 } }),
    enabled: open,
  });

  const mutation = useMutation({
    ...createTradeV1InvestmentsTradesPostMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: listTradesV1InvestmentsTradesGetQueryKey({ client }),
      });
      void queryClient.invalidateQueries({
        queryKey: getHoldingsV1InvestmentsHoldingsGetOptions({ client }).queryKey,
      });
      toast.success("Trade recorded");
      handleClose();
    },
    onError: () => {
      toast.error("Failed to record trade");
    },
  });

  const form = useForm({
    defaultValues: {
      security_id: "",
      bank_account_id: "",
      trade_type: "buy" as string,
      trade_date: format(new Date(), "yyyy-MM-dd"),
      quantity: "",
      price_per_unit: "",
      currency: "SEK",
    },
    onSubmit: ({ value }) => {
      const quantityMicro = Math.round(parseFloat(value.quantity) * 1_000_000);
      const priceCents = Math.round(parseFloat(value.price_per_unit) * 100);
      mutation.mutate({
        client,
        body: {
          security_id: value.security_id,
          bank_account_id: value.bank_account_id,
          trade_type: value.trade_type as TradeType,
          trade_date: new Date(value.trade_date),
          quantity: quantityMicro,
          price_per_unit: priceCents,
          currency: value.currency,
        },
      });
    },
  });

  const handleClose = () => {
    setOpen(false);
    form.reset();
    mutation.reset();
  };

  const securities = securitiesData?.items ?? [];
  const accounts = accountsData?.items ?? [];

  const handleSecurityChange = (securityId: string) => {
    form.setFieldValue("security_id", securityId);
    const sec = securities.find((s) => s.id === securityId);
    if (sec) {
      form.setFieldValue("currency", sec.currency);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Trade
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record Trade</DialogTitle>
          <DialogDescription>Log a buy or sell transaction.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <form.Field
              name="security_id"
              children={(field) => (
                <div className="space-y-2">
                  <Label>
                    Security <span className="text-destructive">*</span>
                  </Label>
                  <Select value={field.state.value} onValueChange={handleSecurityChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {securities.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {s.ticker ? ` (${s.ticker})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />

            <form.Field
              name="bank_account_id"
              children={(field) => (
                <div className="space-y-2">
                  <Label>
                    Account <span className="text-destructive">*</span>
                  </Label>
                  <Select value={field.state.value} onValueChange={(v) => field.handleChange(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <form.Field
              name="trade_type"
              children={(field) => (
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={field.state.value} onValueChange={(v) => field.handleChange(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy">Buy</SelectItem>
                      <SelectItem value="sell">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            />

            <form.Field
              name="trade_date"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="trade-date">Date</Label>
                  <Input
                    id="trade-date"
                    type="date"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                  />
                </div>
              )}
            />
          </div>

          <div className="grid grid-cols-[1fr_1fr_5rem] gap-4">
            <form.Field
              name="quantity"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="trade-qty">
                    Quantity <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="trade-qty"
                    type="number"
                    step="any"
                    min="0"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="0"
                    required
                  />
                </div>
              )}
            />

            <form.Field
              name="price_per_unit"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="trade-price">
                    Price per unit <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="trade-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
              )}
            />

            <form.Field
              name="currency"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="trade-ccy">CCY</Label>
                  <Input
                    id="trade-ccy"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                    maxLength={3}
                    required
                  />
                </div>
              )}
            />
          </div>

          {mutation.isError && (
            <p className="text-destructive text-sm">Failed to record trade. Please try again.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) =>
                [
                  state.values.security_id,
                  state.values.bank_account_id,
                  state.values.quantity,
                  state.values.price_per_unit,
                ] as const
              }
              children={([secId, accId, qty, price]) => (
                <Button
                  type="submit"
                  disabled={mutation.isPending || !secId || !accId || !qty || !price}
                >
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

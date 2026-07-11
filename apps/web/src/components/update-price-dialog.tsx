import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { DollarSign } from "lucide-react";
import { format } from "date-fns";
import type { SecuritySchema } from "@bessel/client";
import {
  createSecurityPriceV1InvestmentsSecuritiesSecurityIdPricesPostMutation,
  getHoldingsV1InvestmentsHoldingsGetOptions,
} from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { Input } from "@bessel/ui/components/input";
import { Label } from "@bessel/ui/components/label";
import { toast } from "sonner";
import { client } from "@/lib/client";

export function UpdatePriceDialog({ security }: { security: SecuritySchema }) {
  const [open, setOpen] = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    ...createSecurityPriceV1InvestmentsSecuritiesSecurityIdPricesPostMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: getHoldingsV1InvestmentsHoldingsGetOptions({ client }).queryKey,
      });
      toast.success("Price updated");
      handleClose();
    },
    onError: () => {
      toast.error("Failed to update price");
    },
  });

  const form = useForm({
    defaultValues: {
      price_date: format(new Date(), "yyyy-MM-dd"),
      price_per_unit: "",
    },
    onSubmit: ({ value }) => {
      const priceCents = Math.round(parseFloat(value.price_per_unit) * 100);
      mutation.mutate({
        client,
        path: { security_id: security.id },
        body: {
          price_date: new Date(value.price_date),
          price_per_unit: priceCents,
          currency: security.currency,
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          form.reset();
          setOpen(true);
        } else {
          handleClose();
        }
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title="Update price"
      >
        <DollarSign className="size-3.5" />
      </Button>
      <DialogContent
        className="sm:max-w-sm"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          priceRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Update Price</DialogTitle>
          <DialogDescription>
            {security.name}
            {security.ticker ? ` (${security.ticker})` : ""} — {security.currency}
          </DialogDescription>
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
              name="price_per_unit"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="price-val">Price ({security.currency})</Label>
                  <Input
                    ref={priceRef}
                    id="price-val"
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
              name="price_date"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="price-date">Date</Label>
                  <Input
                    id="price-date"
                    type="date"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                  />
                </div>
              )}
            />
          </div>

          {mutation.isError && (
            <p className="text-destructive text-sm">
              Failed to save. A price may already exist for this date.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.values.price_per_unit] as const}
              children={([price]) => (
                <Button type="submit" disabled={mutation.isPending || !price}>
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

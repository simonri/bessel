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
import { Textarea } from "@bessel/ui/components/textarea";
import {
  createSecurityV1InvestmentsSecuritiesPostMutation,
  listSecuritiesV1InvestmentsSecuritiesGetQueryKey,
} from "@bessel/client";
import { AssetType } from "@bessel/client";
import { toast } from "sonner";
import { client } from "@/lib/client";

const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: "Stock",
  etf: "ETF",
  mutual_fund: "Mutual Fund",
  bond: "Bond",
  crypto: "Crypto",
  real_estate: "Real Estate",
  other: "Other",
};

export function CreateSecurityDialog() {
  const [open, setOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    ...createSecurityV1InvestmentsSecuritiesPostMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: listSecuritiesV1InvestmentsSecuritiesGetQueryKey({ client }),
      });
      toast.success("Security created");
      handleClose();
    },
    onError: () => {
      toast.error("Failed to create security");
    },
  });

  const form = useForm({
    defaultValues: {
      name: "",
      ticker: "",
      asset_type: "stock" as string,
      currency: "SEK",
      notes: "",
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        client,
        body: {
          name: value.name,
          ticker: value.ticker || null,
          asset_type: value.asset_type as AssetType,
          currency: value.currency,
          notes: value.notes || null,
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
          Add Security
        </Button>
      </DialogTrigger>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Add Security</DialogTitle>
          <DialogDescription>Add an investable asset to your catalog.</DialogDescription>
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
                <Label htmlFor="sec-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  ref={nameRef}
                  id="sec-name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="e.g. Avanza Zero"
                  required
                />
              </div>
            )}
          />

          <form.Field
            name="ticker"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="sec-ticker">Ticker (optional)</Label>
                <Input
                  id="sec-ticker"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="e.g. AAPL"
                  maxLength={20}
                />
              </div>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <form.Field
              name="asset_type"
              children={(field) => (
                <div className="space-y-2">
                  <Label>Asset Type</Label>
                  <Select value={field.state.value} onValueChange={(v) => field.handleChange(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />

            <form.Field
              name="currency"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="sec-currency">
                    Currency <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sec-currency"
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

          <form.Field
            name="notes"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="sec-notes">Notes (optional)</Label>
                <Textarea
                  id="sec-notes"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Any additional details..."
                  rows={2}
                />
              </div>
            )}
          />

          {mutation.isError && (
            <p className="text-destructive text-sm">Failed to create security. Please try again.</p>
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

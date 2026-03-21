import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Pencil } from "lucide-react";
import type { SecuritySchema } from "@metron/client";
import {
  updateSecurityV1InvestmentsSecuritiesSecurityIdPatchMutation,
  listSecuritiesV1InvestmentsSecuritiesGetQueryKey,
  getHoldingsV1InvestmentsHoldingsGetOptions,
} from "@metron/client";
import { AssetType } from "@metron/client";
import { Button } from "@metron/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@metron/ui/components/textarea";
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

export function EditSecurityDialog({ security }: { security: SecuritySchema }) {
  const [open, setOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    ...updateSecurityV1InvestmentsSecuritiesSecurityIdPatchMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: listSecuritiesV1InvestmentsSecuritiesGetQueryKey({ client }),
      });
      void queryClient.invalidateQueries({
        queryKey: getHoldingsV1InvestmentsHoldingsGetOptions({ client }).queryKey,
      });
      toast.success("Security updated");
      handleClose();
    },
    onError: () => {
      toast.error("Failed to update security");
    },
  });

  const form = useForm({
    defaultValues: {
      name: security.name,
      ticker: security.ticker ?? "",
      asset_type: security.asset_type as string,
      currency: security.currency,
      notes: security.notes ?? "",
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        client,
        path: { security_id: security.id },
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
        title="Edit"
        className="size-8 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-3.5" />
      </Button>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit Security</DialogTitle>
          <DialogDescription>Update the details for {security.name}.</DialogDescription>
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
                <Label htmlFor="edit-sec-name">Name</Label>
                <Input
                  ref={nameRef}
                  id="edit-sec-name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          />

          <form.Field
            name="ticker"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-sec-ticker">Ticker (optional)</Label>
                <Input
                  id="edit-sec-ticker"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
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
                  <Label htmlFor="edit-sec-currency">Currency</Label>
                  <Input
                    id="edit-sec-currency"
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
            name="notes"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-sec-notes">Notes (optional)</Label>
                <Textarea
                  id="edit-sec-notes"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          />

          {mutation.isError && (
            <p className="text-destructive text-sm">Failed to update security.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
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

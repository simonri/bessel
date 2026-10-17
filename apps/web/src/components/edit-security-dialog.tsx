import type { SecuritySchema } from "@bessel/client";
import {
  type AssetType,
  getHoldingsV1InvestmentsHoldingsGetOptions,
  listSecuritiesV1InvestmentsSecuritiesGetQueryKey,
  updateSecurityV1InvestmentsSecuritiesSecurityIdPatchMutation,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { Textarea } from "@bessel/ui/components/textarea";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { client } from "@/lib/client";
import { ASSET_TYPE_LABELS } from "@/lib/security-constants";

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
        queryKey: getHoldingsV1InvestmentsHoldingsGetOptions({ client })
          .queryKey,
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
          <DialogDescription>
            Update the details for {security.name}.
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
          </form.Field>

          <form.Field name="ticker">
            {(field) => (
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
          </form.Field>

          <div className="grid grid-cols-2 gap-4">
            <form.Field name="asset_type">
              {(field) => (
                <div className="space-y-2">
                  <Label>Asset Type</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => field.handleChange(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ASSET_TYPE_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>

            <form.Field name="currency">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="edit-sec-currency">Currency</Label>
                  <Input
                    id="edit-sec-currency"
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

          <form.Field name="notes">
            {(field) => (
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
          </form.Field>

          {mutation.isError && (
            <p className="text-destructive text-sm">
              Failed to update security.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
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

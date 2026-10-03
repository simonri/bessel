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
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { PrimaryButton, SoftButton } from "@/components/ui-kit";

const APP_PASSWORDS_URL = "https://account.apple.com/account/manage";

export function ICloudConnectDialog({
  open,
  onOpenChange,
  onConnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (appleId: string, appPassword: string) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { appleId: "", appPassword: "" },
    onSubmit: async ({ value, formApi }) => {
      setError(null);
      try {
        await onConnect(value.appleId.trim(), value.appPassword.trim());
        formApi.reset();
        onOpenChange(false);
      } catch {
        setError(
          "iCloud didn't accept those details. Check the Apple ID and use an app-specific password.",
        );
      }
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect iCloud Calendar</DialogTitle>
          <DialogDescription>
            iCloud needs an app-specific password, not your Apple ID password.
            Create one under Sign-In and Security at{" "}
            <a
              href={APP_PASSWORDS_URL}
              target="_blank"
              rel="noreferrer"
              className="text-white/75 underline underline-offset-2 hover:text-white"
            >
              account.apple.com
            </a>
            .
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="appleId">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor={field.name}>Apple ID</Label>
                <Input
                  id={field.name}
                  type="email"
                  autoComplete="username"
                  placeholder="you@icloud.com"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>
          <form.Field name="appPassword">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor={field.name}>App-specific password</Label>
                <Input
                  id={field.name}
                  type="password"
                  autoComplete="off"
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>

          {error && <p className="text-12 text-red-400">{error}</p>}

          <DialogFooter>
            <SoftButton onClick={() => onOpenChange(false)}>Cancel</SoftButton>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <PrimaryButton type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Connecting…" : "Connect"}
                </PrimaryButton>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

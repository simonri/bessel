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
import { desktopAvanza } from "@/lib/avanza-sync";

export interface AvanzaLogin {
  username: string;
  password: string;
  totpSecret: string;
}

/** Collects the Avanza login; `onConnect` rejects with the message to show. */
export function AvanzaConnectDialog({
  open,
  onOpenChange,
  onConnect,
  username = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (login: AvanzaLogin) => Promise<void>;
  username?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const onDesktop = desktopAvanza() !== undefined;
  const form = useForm({
    defaultValues: { username, password: "", totpSecret: "" },
    onSubmit: async ({ value, formApi }) => {
      setError(null);
      try {
        await onConnect({
          username: value.username.trim(),
          password: value.password,
          totpSecret: value.totpSecret.trim(),
        });
        formApi.reset();
        onOpenChange(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't connect Avanza.");
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
          <DialogTitle>Connect Avanza</DialogTitle>
          <DialogDescription>
            {onDesktop
              ? "Use the secret Avanza shows when you add another app for two-factor login. The login stays in this computer's keychain: the desktop app signs in from here and sends Bessel your accounts, trades and holdings."
              : "Avanza's login can place trades, so it never leaves your computer. Connect Avanza from the Bessel desktop app, which signs in from there and keeps Bessel up to date."}
          </DialogDescription>
        </DialogHeader>

        {!onDesktop ? (
          <DialogFooter>
            <PrimaryButton onClick={() => onOpenChange(false)}>
              Got it
            </PrimaryButton>
          </DialogFooter>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="username">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor="avanza-username">Username</Label>
                  <Input
                    id="avanza-username"
                    autoComplete="username"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor="avanza-password">Password</Label>
                  <Input
                    id="avanza-password"
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="totpSecret">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor="avanza-totp">TOTP secret</Label>
                  <Input
                    id="avanza-totp"
                    type="password"
                    autoComplete="off"
                    placeholder="The code under “Can't scan the QR code?”"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                  />
                </div>
              )}
            </form.Field>

            {error && <p className="text-12 text-red-400">{error}</p>}

            <DialogFooter>
              <SoftButton onClick={() => onOpenChange(false)}>
                Cancel
              </SoftButton>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <PrimaryButton type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Checking with Avanza…" : "Connect"}
                  </PrimaryButton>
                )}
              </form.Subscribe>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

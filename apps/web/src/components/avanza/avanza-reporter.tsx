import {
  type AvanzaConnectionSchema,
  getAccountsOverviewQueryKey,
  getAvanza,
  getAvanzaQueryKey,
} from "@bessel/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { desktopAvanza, syncAvanzaFromDesktop } from "@/lib/avanza-sync";
import { client } from "@/lib/client";

const CHECK_EVERY_MS = 15 * 60 * 1000;
export const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Whether this computer should sign in to Avanza now. Never after Avanza
 * turned the login down: retrying a wrong password could lock the account.
 */
export function isAvanzaSyncDue(
  connection: AvanzaConnectionSchema | null | undefined,
  now: Date,
): boolean {
  if (!connection || connection.credentials_rejected) return false;
  if (!connection.sync_from) return false;
  if (!connection.last_synced_at) return true;
  if (connection.accounts.some((a) => a.bank_account_id && !a.last_synced_at))
    return true;
  return now.getTime() - connection.last_synced_at.getTime() >= SYNC_EVERY_MS;
}

/** Keeps Avanza up to date while the desktop app, which holds the login, is open. Renders nothing. */
export function AvanzaReporter() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const avanza = desktopAvanza();
    if (!avanza) return;
    let running = false;

    const check = async () => {
      if (running) return;
      running = true;
      try {
        if (!(await avanza.status()).username) return;
        const { data } = await getAvanza({ client, throwOnError: true });
        if (!isAvanzaSyncDue(data.connection, new Date())) return;
        await syncAvanzaFromDesktop();
      } catch (err) {
        // Background work: the account shows when it was last updated, and why not.
        console.warn("avanza sync failed", err);
      } finally {
        running = false;
        for (const queryKey of [
          getAvanzaQueryKey({ client }),
          getAccountsOverviewQueryKey({ client }),
        ]) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }
    };

    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [queryClient]);

  return null;
}

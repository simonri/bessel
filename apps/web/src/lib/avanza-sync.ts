import {
  type AvanzaConnectionSchema,
  getAvanza,
  importAvanza,
  reportAvanzaSyncFailed,
} from "@bessel/client";
import { errorDetail } from "@/lib/api-error";
import { client } from "@/lib/client";
import { apiDate } from "@/lib/local-day";
import type { AvanzaLogin } from "@/types/electron";

/** What to tell the user: the desktop app's own message, else the API's. */
export function avanzaErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error)
    // Errors thrown in the desktop app arrive wrapped by Electron's IPC.
    return error.message.replace(
      /^Error invoking remote method '[^']+': (?:\w*Error: )?/,
      "",
    );
  return errorDetail(error, fallback);
}

/** The desktop app's Avanza bridge; absent in the browser and in older desktop builds. */
export function desktopAvanza() {
  return typeof window === "undefined" ? undefined : window.electron?.avanza;
}

async function upload(
  username: string,
  overview: unknown,
  positions: unknown | null,
  transactions: unknown[],
  fetchedFrom: string | null,
): Promise<AvanzaConnectionSchema> {
  const { data } = await importAvanza({
    client,
    body: {
      username,
      overview: overview as Record<string, unknown>,
      positions: positions as Record<string, unknown> | null,
      // Avanza pages are already joined into one list of rows on this computer.
      transactions: transactions.length ? [{ transactions }] : [],
      fetched_from: fetchedFrom ? apiDate(fetchedFrom) : null,
    },
    throwOnError: true,
  });
  return data;
}

/** Checks a new Avanza login on this computer, keeps it in the keychain, and sends Bessel the accounts it sees. */
export async function connectAvanzaFromDesktop(
  login: AvanzaLogin,
): Promise<AvanzaConnectionSchema> {
  const avanza = desktopAvanza();
  if (!avanza) throw new Error("Avanza connects from the Bessel desktop app.");
  const result = await avanza.saveLogin(login);
  if (!result.ok) throw new Error(result.message);
  return upload(result.username, result.overview, null, [], null);
}

/** Signs in to Avanza on this computer and sends Bessel what changed since the last import. */
export async function syncAvanzaFromDesktop(): Promise<AvanzaConnectionSchema> {
  const avanza = desktopAvanza();
  if (!avanza) throw new Error("Open the Bessel desktop app to update Avanza.");
  const { data: status } = await getAvanza({ client, throwOnError: true });
  const from = status.connection?.sync_from;
  const result = await avanza.fetch({
    from: from ? from.toISOString().slice(0, 10) : null,
  });
  if (!result.ok) {
    if (result.reason !== "not_signed_in" && status.connection) {
      await reportAvanzaSyncFailed({
        client,
        body: { reason: result.reason },
      }).catch(() => undefined);
    }
    throw new Error(result.message);
  }
  return upload(
    result.username,
    result.overview,
    result.positions,
    result.transactions,
    result.fetchedFrom,
  );
}

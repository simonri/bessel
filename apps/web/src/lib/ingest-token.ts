import { createIngestTokenV1IngestTokensPost } from "@bessel/client";
import { client } from "@/lib/client";

/**
 * Mints an ingest token for a local daemon on this machine. Creating one
 * revokes the daemon's previous token, so reinstalling rotates it.
 */
export async function createIngestToken(daemon: "monitor"): Promise<string> {
  const { name } = await window.electron!.device.getInfo();
  const { data } = await createIngestTokenV1IngestTokensPost({
    client,
    body: { name: `${daemon}@${name}`.slice(0, 100) },
    throwOnError: true,
  });
  return data.token;
}

import { updateMeV1AuthMePatchMutation } from "@bessel/client";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { client } from "@/lib/client";

/** Tells the API this device's timezone when it differs from the stored one,
 *  so agents using Bessel's MCP server can work in the user's local days. */
export function useReportTimezone(stored: string | null | undefined) {
  const { mutate } = useMutation({
    ...updateMeV1AuthMePatchMutation({ client }),
    meta: { errorToast: false },
  });

  useEffect(() => {
    if (stored === undefined) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone && timezone !== stored) mutate({ body: { timezone } });
  }, [stored, mutate]);
}

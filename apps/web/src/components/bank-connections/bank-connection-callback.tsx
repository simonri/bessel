import { useAuth0 } from "@auth0/auth0-react";
import { completeBankConnectionV1BankConnectionsCallbackPost } from "@bessel/client";
import { Spinner } from "@bessel/ui/components/spinner";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { client } from "@/lib/client";

type Outcome =
  | { status: "pending" }
  | { status: "connected"; bank: string; linked: boolean }
  | { status: "failed"; message: string };

const DENIED_MESSAGE = "Access wasn't approved. Start again from Bessel.";
const FALLBACK_MESSAGE =
  "The bank couldn't complete the approval. Start again from Bessel.";

// The bank's approval page sends the user back here, not to the API, so the
// code is exchanged with the signed-in user's token and the API can check the
// approval was started by them.
export function BankConnectionCallbackPage() {
  const { isLoading, isAuthenticated, loginWithRedirect } = useAuth0();
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [outcome, setOutcome] = useState<Outcome>({ status: "pending" });
  const started = useRef(false);

  useEffect(() => {
    if (isLoading || started.current) return;
    started.current = true;

    if (!isAuthenticated) {
      void loginWithRedirect({
        appState: {
          returnTo: window.location.pathname + window.location.search,
        },
      });
      return;
    }

    // The code is single-use: keep it out of history so a reload can't replay it.
    window.history.replaceState(null, "", window.location.pathname);

    const code = params.get("code");
    const state = params.get("state");
    if (params.has("error") || !code || !state) {
      setOutcome({ status: "failed", message: DENIED_MESSAGE });
      return;
    }

    completeBankConnectionV1BankConnectionsCallbackPost({
      client,
      body: { code, state },
      throwOnError: true,
    })
      .then(({ data }) =>
        setOutcome({
          status: "connected",
          bank: data.bank_name,
          linked: data.accounts.some((a) => a.bank_account_id),
        }),
      )
      .catch((error: unknown) => {
        const detail = (error as { detail?: unknown } | null)?.detail;
        setOutcome({
          status: "failed",
          message: typeof detail === "string" ? detail : FALLBACK_MESSAGE,
        });
      });
  }, [isLoading, isAuthenticated, loginWithRedirect, params]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      {outcome.status === "pending" ? (
        <div className="flex flex-col items-center gap-4">
          <Spinner className="size-6 text-white" />
          <p className="text-sm text-white/50">Connecting your bank…</p>
        </div>
      ) : (
        <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
          <p className="text-sm text-white/80">
            {outcome.status === "connected"
              ? `${outcome.bank} connected`
              : "Bank not connected"}
          </p>
          <p className="text-xs leading-relaxed text-white/50">
            {outcome.status === "failed"
              ? outcome.message
              : outcome.linked
                ? "Transactions keep importing into the same accounts."
                : "Choose which Bessel account each bank account imports into."}
          </p>
          <Link to="/accounts" className="text-xs text-white/60 underline">
            Open accounts
          </Link>
        </div>
      )}
    </div>
  );
}

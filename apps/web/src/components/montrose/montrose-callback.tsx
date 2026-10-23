import { useAuth0 } from "@auth0/auth0-react";
import { completeMontroseV1MontroseCallbackPost } from "@bessel/client";
import { Spinner } from "@bessel/ui/components/spinner";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { client } from "@/lib/client";

/** Set when Montrose was just connected, so the accounts page offers to choose its accounts. */
export const MONTROSE_CONNECTED_KEY = "bessel:montrose-connected";

const DENIED_MESSAGE = "Access wasn't approved. Start again from Bessel.";
const FALLBACK_MESSAGE =
  "Montrose couldn't complete the approval. Start again from Bessel.";

// Montrose's BankID login sends the user back here, not to the API, so the
// code is exchanged with the signed-in user's token and the API can check
// the login was started by them.
export function MontroseCallbackPage() {
  const { isLoading, isAuthenticated, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [failure, setFailure] = useState<string | null>(null);
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
      setFailure(DENIED_MESSAGE);
      return;
    }

    completeMontroseV1MontroseCallbackPost({
      client,
      body: { code, state, iss: params.get("iss") },
      throwOnError: true,
    })
      .then(() => {
        try {
          sessionStorage.setItem(MONTROSE_CONNECTED_KEY, "1");
        } catch {}
        void navigate({ to: "/accounts" });
      })
      .catch((error: unknown) => {
        const detail = (error as { detail?: unknown } | null)?.detail;
        setFailure(typeof detail === "string" ? detail : FALLBACK_MESSAGE);
      });
  }, [isLoading, isAuthenticated, loginWithRedirect, navigate, params]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      {failure === null ? (
        <div className="flex flex-col items-center gap-4">
          <Spinner className="size-6 text-white" />
          <p className="text-13 text-white/50">Connecting Montrose…</p>
        </div>
      ) : (
        <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
          <p className="text-13 text-white/80">Montrose not connected</p>
          <p className="text-12 leading-relaxed text-white/50">{failure}</p>
          <Link to="/accounts" className="text-12 text-white/60 underline">
            Open accounts
          </Link>
        </div>
      )}
    </div>
  );
}

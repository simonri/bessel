import { useAuth0 } from "@auth0/auth0-react";
import { completeGoogleConnectV1CalendarsGoogleCallbackPost } from "@bessel/client";
import { Spinner } from "@bessel/ui/components/spinner";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { client } from "@/lib/client";

type Outcome =
  | { status: "pending" }
  | { status: "connected"; email: string }
  | { status: "failed"; message: string };

const DENIED_MESSAGE = "Access wasn't granted. Start again from Bessel.";
const FALLBACK_MESSAGE =
  "Google couldn't complete the sign-in. Start again from Bessel.";

// Google redirects here, not to the API, so the code is exchanged with the
// signed-in user's token and the API can check the flow was started by them.
export function GoogleCalendarCallbackPage() {
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

    completeGoogleConnectV1CalendarsGoogleCallbackPost({
      client,
      body: { code, state },
      throwOnError: true,
    })
      .then(({ data }) =>
        setOutcome({ status: "connected", email: data.email }),
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
          <p className="text-sm text-white/50">Connecting Google Calendar…</p>
        </div>
      ) : (
        <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
          <p className="text-sm text-white/80">
            {outcome.status === "connected"
              ? "Google Calendar connected"
              : "Google Calendar not connected"}
          </p>
          <p className="text-xs leading-relaxed text-white/50">
            {outcome.status === "connected"
              ? `${outcome.email} is syncing to Bessel. You can close this tab.`
              : outcome.message}
          </p>
          <Link to="/" className="text-xs text-white/60 underline">
            Open Bessel
          </Link>
        </div>
      )}
    </div>
  );
}

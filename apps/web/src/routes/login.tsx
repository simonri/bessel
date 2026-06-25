import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { loginWithRedirect, isAuthenticated, isLoading, error } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) {
      loginWithRedirect();
    }
  }, [isLoading, isAuthenticated, error, loginWithRedirect]);

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <p className="text-sm text-white/70">Authentication error</p>
          <p className="text-xs text-white/40">{error.message}</p>
          <button
            onClick={() => loginWithRedirect()}
            className="text-xs text-white/60 underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <p className="text-sm text-white/50">Signing in…</p>
      </div>
    </div>
  );
}

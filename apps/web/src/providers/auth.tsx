import { type AppState, Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { client } from "@/lib/client";

function AuthInterceptor() {
  const { isAuthenticated, getAccessTokenSilently, logout } = useAuth0();

  useEffect(() => {
    if (!isAuthenticated) return;

    const id = client.interceptors.request.use(async (request) => {
      try {
        const token = await getAccessTokenSilently();
        request.headers.set("Authorization", `Bearer ${token}`);
      } catch {
        logout({ logoutParams: { returnTo: window.location.origin } });
      }
      return request;
    });

    return () => {
      client.interceptors.request.eject(id);
    };
  }, [isAuthenticated, getAccessTokenSilently, logout]);

  return null;
}

// In Electron, loginWithRedirect() opens the Auth0/Google login in the OS's
// real default browser instead of navigating this window (see openUrl below)
// — Google blocks its own login page when it detects an embedded browser like
// an Electron BrowserWindow, regardless of User-Agent spoofing. The system
// browser hands the OAuth callback to apps/desktop's local loopback server
// (main.ts, AUTH_CALLBACK_PORT), which forwards the callback URL here over IPC
// so it can be fed into the SDK exactly like a normal window navigation would.
function ElectronAuthCallback() {
  const { handleRedirectCallback } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isElectron) return;
    return window.electron!.auth.onCallback((url) => {
      handleRedirectCallback(url)
        .then((result) => {
          const returnTo = (result?.appState as AppState | undefined)?.returnTo;
          navigate({ to: returnTo ?? "/" });
        })
        .catch((err: unknown) => {
          console.error("Failed to complete Google/Auth0 login", err);
        });
    });
  }, [handleRedirectCallback, navigate]);

  return null;
}

// Custom Auth0 cache backed by Electron's safeStorage (OS keychain encryption).
// Only used when running inside the Electron shell — the main process encrypts
// the token blob via safeStorage and stores it in userData, never touching
// the renderer's localStorage.
class ElectronAuthCache {
  async get<T>(key: string): Promise<T | undefined> {
    const value = await window.electron!.auth.get(key);
    return value !== null ? (JSON.parse(value) as T) : undefined;
  }

  async set<T>(key: string, entry: T): Promise<void> {
    await window.electron!.auth.set(key, JSON.stringify(entry));
  }

  async remove(key: string): Promise<void> {
    await window.electron!.auth.remove(key);
  }

  async allKeys(): Promise<string[]> {
    return window.electron!.auth.allKeys();
  }
}

const isElectron = typeof window !== "undefined" && !!window.electron;

// One-time purge: remove any plaintext Auth0 tokens left in localStorage from
// before this change. Keys follow the pattern @@auth0spajs@@::...
if (isElectron) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith("@@auth0spajs@@")) {
      localStorage.removeItem(key);
    }
  }
}

const electronCache = isElectron ? new ElectronAuthCache() : undefined;

const domain = import.meta.env.VITE_AUTH0_DOMAIN as string;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string;

// Must match apps/desktop/src/main.ts's AUTH_CALLBACK_PORT. Add this exact URL
// to the Auth0 application's Allowed Callback URLs.
const ELECTRON_REDIRECT_URI = "http://127.0.0.1:41823/callback";
const redirectUri = isElectron
  ? ELECTRON_REDIRECT_URI
  : (import.meta.env.VITE_FRONTEND_URL as string);

// Passed to loginWithRedirect() so Electron opens the login page in the
// system's default browser instead of navigating the app window there.
export const loginOpenUrlOptions = isElectron
  ? { openUrl: (url: string) => void window.electron!.shell.openExternal(url) }
  : {};

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      cacheLocation={isElectron ? undefined : "localstorage"}
      cache={isElectron ? electronCache : undefined}
      useRefreshTokens={true}
      useRefreshTokensFallback={!isElectron}
      onRedirectCallback={(appState?: AppState) => {
        navigate({ to: (appState?.returnTo as string) ?? "/" });
      }}
      authorizationParams={{
        redirect_uri: redirectUri,
        audience,
        scope: "openid profile email offline_access",
      }}
    >
      <AuthInterceptor />
      <ElectronAuthCallback />
      {children}
    </Auth0Provider>
  );
}

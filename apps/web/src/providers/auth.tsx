import { Auth0Provider, useAuth0, type AppState } from "@auth0/auth0-react";
import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
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
const redirectUri = import.meta.env.VITE_FRONTEND_URL as string;

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
      {children}
    </Auth0Provider>
  );
}

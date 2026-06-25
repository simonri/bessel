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
      cacheLocation="localstorage"
      useRefreshTokens={true}
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

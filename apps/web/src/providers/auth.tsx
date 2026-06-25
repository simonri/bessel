import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useEffect, type ReactNode } from "react";
import { client } from "@/lib/client";

function AuthInterceptor() {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    if (!isAuthenticated) return;

    const id = client.interceptors.request.use(async (request) => {
      try {
        const token = await getAccessTokenSilently();
        request.headers.set("Authorization", `Bearer ${token}`);
      } catch {
        // Token fetch failed; the server will return 401
      }
      return request;
    });

    return () => {
      client.interceptors.request.eject(id);
    };
  }, [isAuthenticated, getAccessTokenSilently]);

  return null;
}

const domain = import.meta.env.VITE_AUTH0_DOMAIN as string;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string;
const redirectUri = import.meta.env.VITE_FRONTEND_URL as string;

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: redirectUri,
        audience,
      }}
    >
      <AuthInterceptor />
      {children}
    </Auth0Provider>
  );
}

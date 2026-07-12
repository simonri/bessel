import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { TooltipProvider } from "@bessel/ui/components/tooltip";
import { ReactQueryProvider } from "@/providers/react-query";
import { AuthProvider } from "@/providers/auth";
import { ErrorBoundary } from "@/components/error-boundary";
import { initSentry } from "@/lib/sentry";

import appCss from "../styles.css?url";

void initSentry();

export const Route = createRootRoute({
  notFoundComponent: () => <p>Page not found</p>,
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        name: "robots",
        content: "index, follow",
      },
      {
        title: "Bessel",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.ico",
        type: "image/png",
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap",
      },
    ],
  }),

  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" className="dark font-sans">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        <ErrorBoundary>
          <AuthProvider>
            <ReactQueryProvider>
              <TooltipProvider>
                <Outlet />
              </TooltipProvider>
            </ReactQueryProvider>
          </AuthProvider>
        </ErrorBoundary>
        <Toaster theme="dark" richColors closeButton />
        <Scripts />
      </body>
    </html>
  );
}

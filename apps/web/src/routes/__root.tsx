import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ReactQueryProvider } from "@/providers/react-query";

import appCss from "../styles.css?url";

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
        title: "Metron",
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
      }
    ],
  }),

  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" className="font-sans">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        <ReactQueryProvider>
          <Outlet />
        </ReactQueryProvider>
        <Scripts />
      </body>
    </html>
  );
}

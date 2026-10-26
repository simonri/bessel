import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

const SITE_URL = "https://getbessel.com";
const TITLE = "Bessel - your life, in one place";
const DESCRIPTION =
  "Claude can reason about almost anything except your life. Bessel connects your calendar, money, health, tasks and contacts, so it can help with your actual days. Free for macOS, Windows, Linux and the browser.";
const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Bessel",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "macOS, Windows, Linux",
  description: DESCRIPTION,
  url: SITE_URL,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  isAccessibleForFree: true,
};

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
        title: TITLE,
      },
      {
        name: "description",
        content: DESCRIPTION,
      },
      {
        name: "keywords",
        content:
          "Bessel, personal dashboard, calendar, tasks, budget, personal CRM, recipes, Claude",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:site_name",
        content: "Bessel",
      },
      {
        property: "og:url",
        content: SITE_URL,
      },
      {
        property: "og:title",
        content: TITLE,
      },
      {
        property: "og:description",
        content: DESCRIPTION,
      },
      {
        property: "og:image",
        content: OG_IMAGE,
      },
      {
        property: "og:image:width",
        content: "1200",
      },
      {
        property: "og:image:height",
        content: "630",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: TITLE,
      },
      {
        name: "twitter:description",
        content: DESCRIPTION,
      },
      {
        name: "twitter:image",
        content: OG_IMAGE,
      },
    ],
    links: [
      {
        rel: "canonical",
        href: SITE_URL,
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.svg",
        type: "image/svg+xml",
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
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,400..600&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(STRUCTURED_DATA),
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
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

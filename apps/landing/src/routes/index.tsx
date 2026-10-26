import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  ChefHat,
  Download as DownloadIcon,
  ListChecks,
  Menu,
  MessageSquare,
  Moon,
  SquareTerminal,
  Sun,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import heroSky from "@/assets/hero-sky.webp";
import { AppMockup } from "@/components/app-mockup";
import {
  AppleLogo,
  GitHubLogo,
  LinuxLogo,
  WindowsLogo,
} from "@/components/icons";
import { LiveBackground } from "@/components/live-background";
import { BesselMark, Wordmark } from "@/components/logo";
import { type Platform, usePlatform } from "@/hooks/use-platform";

const PLATFORM_ICON: Record<Platform, ReactNode> = {
  mac: <AppleLogo className="size-4" />,
  windows: <WindowsLogo className="size-4" />,
  linux: <LinuxLogo className="size-4" />,
};
const PLATFORM_LABEL: Record<Platform, string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
};

const GITHUB_URL = "https://github.com/simonri/bessel";
const DOWNLOAD_URL = `${GITHUB_URL}/releases/latest`;
const APP_URL = "https://app.getbessel.com";

// Applied to every link that leaves the landing page (a different domain,
// including subdomains like app.getbessel.com) so it opens in a new tab
// instead of navigating away from the marketing site.
const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;
const isExternalHref = (href: string) => !href.startsWith("#");

// Fixed, version-free artifact names (set via `artifactName` in
// apps/desktop/package.json) so these links always resolve to whatever the
// latest release published, with no landing-page redeploy per version.
const PLATFORM_ASSET: Record<Platform, string> = {
  mac: "Bessel-mac-arm64.dmg",
  windows: "Bessel-win-x64.exe",
  // electron-builder maps the Linux target's ${arch} to the distro-packaging
  // convention (x86_64/aarch64), unlike mac/win which use the raw x64/arm64.
  linux: "Bessel-linux-x86_64.AppImage",
};
const platformDownloadUrl = (platform: Platform) =>
  `${DOWNLOAD_URL}/download/${PLATFORM_ASSET[platform]}`;

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function riseDelay(seconds: number) {
  return { "--rise-delay": `${seconds}s` } as CSSProperties;
}

function LandingPage() {
  return (
    <div className="relative min-h-svh overflow-x-hidden">
      <LiveBackground />
      <div className="grain pointer-events-none fixed inset-0 opacity-[0.05]" />

      <div className="relative">
        <Nav />
        <Hero />
        <Thesis />
        <Features />
        <Download />
        <FinalCta />
        <Footer />
      </div>
    </div>
  );
}

const NAV_LINKS = [
  { href: "#why", label: "Why" },
  { href: "#features", label: "What's in it" },
  { href: "#download", label: "Download" },
];

function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-background/80 backdrop-blur-md">
      <div className="mx-auto grid h-14 w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-6">
        <a
          href="/"
          aria-label="Bessel home"
          className="col-start-1 flex items-center"
        >
          <Wordmark />
        </a>
        <nav className="col-start-2 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors duration-150 pointer-fine:hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="col-start-3 flex items-center justify-end gap-3 sm:gap-4">
          <a
            href={GITHUB_URL}
            aria-label="GitHub"
            className="text-muted-foreground transition-colors duration-150 pointer-fine:hover:text-foreground"
            {...EXTERNAL_LINK_PROPS}
          >
            <GitHubLogo className="size-4.5" />
          </a>
          <a
            href={APP_URL}
            className="hidden rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-foreground transition-[transform,border-color,background-color] duration-150 ease-out-strong active:scale-[0.97] sm:inline-flex pointer-fine:hover:border-white/30 pointer-fine:hover:bg-white/[0.06]"
            {...EXTERNAL_LINK_PROPS}
          >
            Sign in
          </a>
          <a
            href="#download"
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-transform duration-150 ease-out-strong active:scale-[0.97] pointer-fine:hover:bg-white"
          >
            Download
          </a>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="text-muted-foreground transition-colors duration-150 pointer-fine:hover:text-foreground md:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="flex flex-col gap-1 border-t border-white/[0.06] px-6 py-3 md:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-2 py-2.5 text-sm text-muted-foreground transition-colors duration-150 pointer-fine:hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <a
            href={APP_URL}
            onClick={() => setMenuOpen(false)}
            className="rounded-lg px-2 py-2.5 text-sm text-muted-foreground transition-colors duration-150 pointer-fine:hover:text-foreground sm:hidden"
            {...EXTERNAL_LINK_PROPS}
          >
            Sign in
          </a>
        </nav>
      )}
    </header>
  );
}

function Hero() {
  const platform = usePlatform() ?? "mac";
  return (
    <section className="relative isolate w-full overflow-hidden">
      <div className="relative">
        <img
          src={heroSky}
          alt=""
          aria-hidden
          className="hero-zoom absolute inset-0 h-full w-full object-cover object-[center_82%] [mask-image:linear-gradient(to_bottom,#000_82%,transparent_99%)]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/8 via-black/0 to-black/5 [mask-image:linear-gradient(to_bottom,#000_82%,transparent_99%)]" />

        <div className="relative flex min-h-[720px] flex-col items-center justify-center px-6 py-14 text-center [text-shadow:0_2px_20px_rgba(255,255,255,0.45)] sm:min-h-[820px] md:min-h-[960px]">
          <h1
            className="rise max-w-2xl text-balance font-serif text-5xl font-medium tracking-tight text-ink sm:text-6xl md:text-7xl"
            style={riseDelay(0.05)}
          >
            Your life, in <span className="font-normal italic">one</span> place.
          </h1>
          <p
            className="rise mt-5 max-w-xl text-balance text-base font-medium leading-relaxed text-ink sm:text-lg"
            style={riseDelay(0.15)}
          >
            Calendar, tasks, money, health, recipes and the people you know,
            <br className="hidden sm:block" /> in one app. And Claude can look
            at it when you ask.
          </p>
          <div
            className="rise mt-8 flex flex-col items-center gap-3"
            style={riseDelay(0.25)}
          >
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={platformDownloadUrl(platform)}
                className="flex items-center gap-2.5 rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream [text-shadow:none] transition-transform duration-150 ease-out-strong active:scale-[0.97] pointer-fine:hover:bg-[#141210]"
                download
              >
                {PLATFORM_ICON[platform]}
                Download for {PLATFORM_LABEL[platform]}
              </a>
              <a
                href="#download"
                className="rounded-full border border-ink/25 bg-white/10 px-6 py-3 text-sm text-ink backdrop-blur-[2px] transition-[transform,color,border-color,background-color] duration-150 ease-out-strong active:scale-[0.97] pointer-fine:hover:border-ink/45 pointer-fine:hover:bg-white/25"
              >
                All platforms
              </a>
            </div>
            <span className="text-xs text-[#211d17] [text-shadow:0_1px_14px_rgba(255,255,255,0.7)]">
              Free, and the code is on GitHub
            </span>
          </div>
        </div>
      </div>

      <AppMockup className="rise mx-auto mt-6 max-w-5xl px-8 sm:-mt-16 sm:px-6 md:-mt-20" />
    </section>
  );
}

function Thesis() {
  return (
    <section
      id="why"
      className="mx-auto w-full max-w-3xl scroll-mt-20 px-6 pt-28 sm:pt-36"
    >
      <div className="reveal flex flex-col items-center text-center">
        <span className="text-sm font-medium text-accent">Why Bessel</span>
        <p className="mt-5 text-balance font-serif text-3xl font-medium leading-[1.2] tracking-tight sm:text-4xl">
          Your days are spread over a{" "}
          <span className="font-normal italic">dozen</span> apps.
        </p>
        <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
          The bank app knows your money, the calendar knows your time, and the
          rest lives in notes and screenshots. Bessel puts it in one place you
          can take in at a glance. Claude gets the same view, so asking
          &ldquo;what&rsquo;s on this week?&rdquo; or &ldquo;what did we spend
          on food?&rdquo; gets a real answer.
        </p>
      </div>
    </section>
  );
}

const FEATURES: {
  icon: ReactNode;
  title: string;
  description: string;
  span?: 2 | 3;
}[] = [
  {
    icon: <Sun className="size-4.5" />,
    title: "Your day in one look",
    description:
      "What's next on the calendar, what's due, how you slept and whose birthday is coming up. Before a meeting it shows who's coming and what you noted last time.",
    span: 2,
  },
  {
    icon: <CalendarDays className="size-4.5" />,
    title: "Calendars you can edit",
    description:
      "Google and iCloud side by side. Add, move and change events without switching apps.",
  },
  {
    icon: <ListChecks className="size-4.5" />,
    title: "Tasks, without the scoreboard",
    description:
      "Projects, due dates and chores that come back every week. No streaks and no daily targets.",
  },
  {
    icon: <Wallet className="size-4.5" />,
    title: "Where the money went",
    description:
      "Bank accounts, card bills and investments in one place, sorted into categories as they come in.",
  },
  {
    icon: <Users className="size-4.5" />,
    title: "Remember people",
    description:
      "Your Google contacts, kept in sync both ways, plus a private log of what you talked about. After a meeting it asks if there's anything to note.",
  },
  {
    icon: <ChefHat className="size-4.5" />,
    title: "Recipes you actually cook",
    description:
      "Save a recipe once, scale it, follow it step by step at the stove, and see when you last made it.",
  },
  {
    icon: <Moon className="size-4.5" />,
    title: "Sleep, workouts and places",
    description:
      "From Apple Health and your location history, so you can see where a week actually went.",
  },
  {
    icon: <SquareTerminal className="size-4.5" />,
    title: "Room for your work",
    description:
      "Terminals, git and Claude Code in windows next to everything else, arranged the way you like.",
  },
  {
    icon: <MessageSquare className="size-4.5" />,
    title: "Ask Claude about your life",
    description:
      "Connect Bessel to Claude and it can read your calendar, money, recipes and contacts, add tasks and events, and note down a coffee with a friend. It can't delete anything.",
    span: 3,
  },
];

function Features() {
  return (
    <section
      id="features"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 pt-28 sm:pt-36"
    >
      <SectionHeading
        eyebrow="What's in it"
        title="The everyday, all together"
        subtitle="Use the parts you need and leave the rest closed."
      />
      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className={`group reveal rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors duration-200 pointer-fine:hover:border-white/[0.14] pointer-fine:hover:bg-white/[0.04] ${
              feature.span === 3
                ? "sm:col-span-2 lg:col-span-3"
                : feature.span === 2
                  ? "lg:col-span-2"
                  : ""
            }`}
          >
            <div className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-accent transition-colors duration-200 pointer-fine:group-hover:border-accent/25 pointer-fine:group-hover:bg-accent/[0.06]">
              {feature.icon}
            </div>
            <h3 className="mt-4 text-[15px] font-medium">{feature.title}</h3>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

const PLATFORMS: {
  id: Platform;
  icon: ReactNode;
  name: string;
  detail: string;
}[] = [
  {
    id: "mac",
    icon: <AppleLogo className="size-6" />,
    name: "macOS",
    detail: "Apple Silicon - .dmg",
  },
  {
    id: "windows",
    icon: <WindowsLogo className="size-6" />,
    name: "Windows",
    detail: "64-bit installer - .exe",
  },
  {
    id: "linux",
    icon: <LinuxLogo className="size-6" />,
    name: "Linux",
    detail: "AppImage - x64",
  },
];

function Download() {
  const platform = usePlatform();
  return (
    <section
      id="download"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 pt-28 sm:pt-36"
    >
      <SectionHeading
        eyebrow="Download"
        title="On your computer"
        subtitle="For macOS, Windows and Linux, and it updates itself."
      />
      <div className="reveal mt-12 flex flex-col gap-3 sm:grid sm:grid-cols-3">
        {PLATFORMS.map((p) => {
          const isDetected = p.id === platform;
          return (
            <a
              key={p.name}
              href={platformDownloadUrl(p.id)}
              className={`group flex items-center gap-4 rounded-2xl border p-5 transition-[transform,border-color,background-color] duration-200 ease-out-strong active:scale-[0.98] ${
                isDetected
                  ? "border-accent/40 bg-accent/[0.06] pointer-fine:hover:border-accent/60"
                  : "border-white/[0.09] bg-white/[0.035] pointer-fine:hover:border-white/[0.2] pointer-fine:hover:bg-white/[0.06]"
              }`}
              download
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.05] text-foreground">
                {p.icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 text-[15px] font-medium">
                  {p.name}
                  {isDetected && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                      Your OS
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {p.detail}
                </span>
              </span>
              <DownloadIcon className="size-4 shrink-0 text-muted-foreground transition-colors duration-200 group-hover:text-foreground" />
            </a>
          );
        })}
      </div>
      <p className="mt-6 text-balance text-center text-sm text-muted-foreground">
        Or use it in the browser at{" "}
        <a
          href={APP_URL}
          className="text-foreground underline decoration-white/25 underline-offset-2 pointer-fine:hover:decoration-white/50"
          {...EXTERNAL_LINK_PROPS}
        >
          app.getbessel.com
        </a>
        . An iPhone app is on the way.
      </p>
    </section>
  );
}

function FinalCta() {
  const platform = usePlatform() ?? "mac";
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-24 pt-32 sm:pb-28 sm:pt-40">
      <div className="reveal flex flex-col items-center text-center">
        <BesselMark className="size-8 text-accent" />
        <h2 className="mt-6 text-balance font-serif text-4xl font-medium tracking-tight sm:text-5xl">
          Bring it all <span className="font-normal italic">together</span>.
        </h2>
        <p className="mt-4 max-w-sm text-balance text-base text-muted-foreground">
          Free to use. Connect what you already have and it fills itself in.
        </p>
        <a
          href={platformDownloadUrl(platform)}
          className="mt-8 flex items-center gap-2.5 rounded-full bg-foreground px-7 py-3 text-sm font-medium text-background transition-transform duration-150 ease-out-strong active:scale-[0.97] pointer-fine:hover:bg-white"
          download
        >
          {PLATFORM_ICON[platform]}
          Download Bessel
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 sm:grid-cols-[1fr_auto_auto] sm:gap-20">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-xs text-sm text-faint-foreground">
            Your calendar, tasks, money and people in one place.
          </p>
        </div>
        <FooterColumn
          title="Product"
          links={[
            { label: "Features", href: "#features" },
            { label: "Download", href: "#download" },
            { label: "Releases", href: DOWNLOAD_URL },
          ]}
        />
        <FooterColumn
          title="Resources"
          links={[
            { label: "GitHub", href: GITHUB_URL },
            { label: "Report an issue", href: `${GITHUB_URL}/issues` },
          ]}
        />
      </div>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between border-t border-white/[0.06] px-6 py-6">
        <span className="text-xs text-faint-foreground">
          © {new Date().getFullYear()} Bessel
        </span>
        <span className="text-xs text-faint-foreground">
          Built in the open.
        </span>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">{title}</span>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          className="text-sm text-muted-foreground transition-colors duration-150 pointer-fine:hover:text-foreground"
          {...(isExternalHref(link.href) ? EXTERNAL_LINK_PROPS : {})}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="reveal flex flex-col items-center text-center">
      <span className="text-sm font-medium text-accent">{eyebrow}</span>
      <h2 className="mt-4 text-balance font-serif text-3xl font-medium tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 max-w-md text-balance text-base text-muted-foreground">
        {subtitle}
      </p>
    </div>
  );
}

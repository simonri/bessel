import type { CSSProperties, ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bot,
  Command,
  Download as DownloadIcon,
  GitBranch,
  LayoutGrid,
  Map,
  ServerCog,
  SquareTerminal,
  Wallet,
} from "lucide-react";
import { AppMockup } from "@/components/app-mockup";
import { AppleLogo, GitHubLogo, LinuxLogo, WindowsLogo } from "@/components/icons";
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

const APP_URL = "https://app.getbessel.com";
const GITHUB_URL = "https://github.com/simonri/bessel";
const DOWNLOAD_URL = `${GITHUB_URL}/releases/latest`;

// Applied to every link that leaves the landing page (a different domain,
// including subdomains like app.getbessel.com) so it opens in a new tab
// instead of navigating away from the marketing site.
const EXTERNAL_LINK_PROPS = { target: "_blank", rel: "noopener noreferrer" } as const;
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
const platformDownloadUrl = (platform: Platform) => `${DOWNLOAD_URL}/download/${PLATFORM_ASSET[platform]}`;

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function riseDelay(seconds: number) {
  return { "--rise-delay": `${seconds}s` } as CSSProperties;
}

function LandingPage() {
  return (
    <div className="relative min-h-svh">
      <LiveBackground />
      <div className="grain pointer-events-none fixed inset-0 opacity-[0.05]" />

      <div className="relative">
        <Nav />
        <Hero />
        <Thesis />
        <Features />
        <SelfHosted />
        <Download />
        <FinalCta />
        <Footer />
      </div>
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/60 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <a href="#" aria-label="Bessel home" className="flex items-center">
            <Wordmark />
          </a>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <a href="#why" className="transition-colors duration-150 pointer-fine:hover:text-foreground">
              Why
            </a>
            <a href="#features" className="transition-colors duration-150 pointer-fine:hover:text-foreground">
              Features
            </a>
            <a href="#self-hosted" className="transition-colors duration-150 pointer-fine:hover:text-foreground">
              Self-hosted
            </a>
            <a href="#download" className="transition-colors duration-150 pointer-fine:hover:text-foreground">
              Download
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-5">
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
            className="hidden text-sm text-muted-foreground transition-colors duration-150 pointer-fine:hover:text-foreground sm:block"
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
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const platform = usePlatform() ?? "mac";
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pt-24 sm:pt-32">
      <div className="flex flex-col items-center text-center">
        <h1
          className="rise max-w-3xl text-balance text-5xl font-medium tracking-tight sm:text-6xl md:text-7xl"
          style={riseDelay(0.05)}
        >
          Your life, measured.
        </h1>
        <p
          className="rise mt-6 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg"
          style={riseDelay(0.15)}
        >
          Money, health, places, and projects - all on one desktop canvas
          that's entirely yours.
        </p>
        <div className="rise mt-9 flex flex-col items-center gap-3" style={riseDelay(0.25)}>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={platformDownloadUrl(platform)}
              className="flex items-center gap-2.5 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-transform duration-150 ease-out-strong active:scale-[0.97] pointer-fine:hover:bg-white"
              download
            >
              {PLATFORM_ICON[platform]}
              Download for {PLATFORM_LABEL[platform]}
            </a>
            <a
              href="#download"
              className="rounded-full border border-border px-6 py-3 text-sm text-muted-foreground transition-[transform,color,border-color] duration-150 ease-out-strong active:scale-[0.97] pointer-fine:hover:border-white/25 pointer-fine:hover:text-foreground"
            >
              All platforms
            </a>
          </div>
          <span className="text-xs text-faint-foreground">
            Free &amp; open source · macOS, Windows &amp; Linux
          </span>
        </div>
      </div>

      <AppMockup className="rise mx-auto mt-16 max-w-4xl sm:mt-20" />
    </section>
  );
}

function Thesis() {
  return (
    <section id="why" className="mx-auto w-full max-w-3xl scroll-mt-20 px-6 pt-28 sm:pt-36">
      <div className="flex flex-col items-center text-center">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
          Why Bessel
        </span>
        <p className="mt-5 text-balance text-2xl font-medium leading-snug tracking-tight sm:text-3xl md:text-4xl">
          AI keeps getting smarter. It still only knows what you tell it.
        </p>
        <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
          The missing piece was never intelligence, it's context. Bessel pulls
          your finances, health, travel, and habits into one place, so the
          full picture of your life finally exists somewhere AI can use it.
        </p>
      </div>
    </section>
  );
}

const FEATURES: {
  icon: ReactNode;
  title: string;
  description: string;
  wide?: boolean;
}[] = [
  {
    icon: <LayoutGrid className="size-4.5" />,
    title: "A canvas, not a feed",
    description:
      "Widgets live in windows you drag, resize, and snap to a grid. Save layouts as workspaces and flip between them like desktops.",
    wide: true,
  },
  {
    icon: <SquareTerminal className="size-4.5" />,
    title: "A real terminal",
    description:
      "Full PTY terminals in a widget - run your dev servers and scripts without leaving the dashboard.",
  },
  {
    icon: <GitBranch className="size-4.5" />,
    title: "Git at a glance",
    description:
      "Branches, staged files, and diffs for every repo you care about, always one glance away.",
  },
  {
    icon: <Bot className="size-4.5" />,
    title: "Agents on board",
    description:
      "Run Claude Code and Codex in their own widgets, working beside everything else in your day.",
  },
  {
    icon: <Wallet className="size-4.5" />,
    title: "Money, honestly",
    description:
      "Accounts, transactions, holdings, and trades in one ledger - with imports, categories, and charts.",
  },
  {
    icon: <Map className="size-4.5" />,
    title: "Life, logged",
    description:
      "A travel timeline on a real map, places you love, recipes, workouts, and a task board for the rest.",
  },
  {
    icon: <Command className="size-4.5" />,
    title: "Everything is a keystroke away",
    description:
      "A command palette opens widgets, switches workspaces, and jumps anywhere. Your hands never leave the keyboard.",
    wide: true,
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 pt-28 sm:pt-36">
      <SectionHeading
        eyebrow="Features"
        title="One window for your whole day"
        subtitle="Not another app to check - the surface everything else lands on."
      />
      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className={`group rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors duration-200 pointer-fine:hover:border-white/[0.14] pointer-fine:hover:bg-white/[0.04] ${
              feature.wide ? "lg:col-span-2" : ""
            }`}
          >
            <div className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-accent">
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

function SelfHosted() {
  return (
    <section id="self-hosted" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 pt-28 sm:pt-36">
      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        <div className="grid items-center gap-10 p-8 sm:p-12 lg:grid-cols-2">
          <div>
            <span className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-accent">
              <ServerCog className="size-4.5" />
            </span>
            <h2 className="mt-5 text-balance text-3xl font-medium tracking-tight sm:text-4xl">
              Your data never leaves your hands
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Bessel is self-hosted and open source. The desktop app talks to
              a backend you run yourself, keeping your finances, your
              locations, and your history on your own hardware. No
              telemetry, no third parties.
            </p>
            <a
              href={GITHUB_URL}
              className="mt-6 inline-flex items-center gap-2 text-sm text-foreground transition-colors duration-150 pointer-fine:hover:text-accent-soft"
              {...EXTERNAL_LINK_PROPS}
            >
              <GitHubLogo className="size-4" />
              Read the source on GitHub
            </a>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-[#101116]/80 p-5 font-mono text-xs leading-loose text-white/70">
            <p className="text-white/45"># bring your own server</p>
            <p>
              <span className="text-[#f97316]">❯</span> docker compose up -d
            </p>
            <p className="text-white/55">✔ postgres · ready</p>
            <p className="text-white/55">✔ redis · ready</p>
            <p>
              <span className="text-[#f97316]">❯</span> uv run task api
            </p>
            <p className="text-white/55">INFO API listening on :8100</p>
            <p className="text-emerald-400/90">Bessel is yours.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const PLATFORMS: { id: Platform; icon: ReactNode; name: string; detail: string }[] = [
  {
    id: "mac",
    icon: <AppleLogo className="size-6" />,
    name: "macOS",
    detail: "Apple Silicon · .dmg",
  },
  {
    id: "windows",
    icon: <WindowsLogo className="size-6" />,
    name: "Windows",
    detail: "64-bit installer · .exe",
  },
  {
    id: "linux",
    icon: <LinuxLogo className="size-6" />,
    name: "Linux",
    detail: "AppImage · x64",
  },
];

function Download() {
  const platform = usePlatform();
  return (
    <section id="download" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 pt-28 sm:pt-36">
      <SectionHeading
        eyebrow="Download"
        title="Runs where you work"
        subtitle="One app, three platforms, auto-updates included."
      />
      <div className="mt-12 flex flex-col gap-3 sm:grid sm:grid-cols-3">
        {PLATFORMS.map((p) => {
          const isDetected = p.id === platform;
          return (
            <a
              key={p.name}
              href={platformDownloadUrl(p.id)}
              className={`group flex items-center gap-4 rounded-xl border p-5 transition-[transform,border-color,background-color] duration-200 ease-out-strong active:scale-[0.98] ${
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
                <span className="text-sm text-muted-foreground">{p.detail}</span>
              </span>
              <DownloadIcon className="size-4 shrink-0 text-muted-foreground transition-colors duration-200 group-hover:text-foreground" />
            </a>
          );
        })}
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Latest release on{" "}
        <a
          href={DOWNLOAD_URL}
          className="text-foreground underline decoration-white/25 underline-offset-2 pointer-fine:hover:decoration-white/50"
          {...EXTERNAL_LINK_PROPS}
        >
          GitHub Releases
        </a>
      </p>
    </section>
  );
}

function FinalCta() {
  const platform = usePlatform() ?? "mac";
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-32 sm:pt-40">
      <div className="flex flex-col items-center text-center">
        <BesselMark className="size-8 text-accent" />
        <h2 className="mt-6 text-balance text-4xl font-medium tracking-tight sm:text-5xl">
          Measure your life.
        </h2>
        <p className="mt-4 max-w-sm text-balance text-base text-muted-foreground">
          Signal, without the noise. Free, open source, and yours.
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
            A personal dashboard for one. Built in the open.
          </p>
        </div>
        <FooterColumn
          title="Product"
          links={[
            { label: "Features", href: "#features" },
            { label: "Download", href: "#download" },
            { label: "Changelog", href: DOWNLOAD_URL },
          ]}
        />
        <FooterColumn
          title="Resources"
          links={[
            { label: "GitHub", href: GITHUB_URL },
            { label: "Report an issue", href: `${GITHUB_URL}/issues` },
            { label: "Sign in", href: APP_URL },
          ]}
        />
      </div>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between border-t border-white/[0.06] px-6 py-6">
        <span className="text-xs text-faint-foreground">
          © {new Date().getFullYear()} Bessel
        </span>
        <span className="text-xs text-faint-foreground">A dashboard for one.</span>
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
    <div className="flex flex-col items-center text-center">
      <span className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-balance text-3xl font-medium tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 max-w-md text-balance text-base text-muted-foreground">{subtitle}</p>
    </div>
  );
}

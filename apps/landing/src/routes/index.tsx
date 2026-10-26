import { createFileRoute } from "@tanstack/react-router";
import {
  Download as DownloadIcon,
  Eye,
  FileCode,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import heroSky from "@/assets/hero-sky.webp";
import { CompareChat } from "@/components/compare-chat";
import { ContextFlow } from "@/components/context-flow";
import {
  AppleLogo,
  GitHubLogo,
  LinuxLogo,
  WindowsLogo,
} from "@/components/icons";
import { LiveBackground } from "@/components/live-background";
import { Wordmark } from "@/components/logo";
import { TodayPreview } from "@/components/today-preview";
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
        <HowItWorks />
        <Questions />
        <Privacy />
        <TheApp />
        <Closing />
        <Footer />
      </div>
    </div>
  );
}

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#privacy", label: "Privacy" },
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

function SkyActions({ platform }: { platform: Platform }) {
  return (
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
        href={APP_URL}
        className="rounded-full border border-ink/25 bg-white/10 px-6 py-3 text-sm text-ink backdrop-blur-[2px] transition-[transform,color,border-color,background-color] duration-150 ease-out-strong active:scale-[0.97] pointer-fine:hover:border-ink/45 pointer-fine:hover:bg-white/25"
        {...EXTERNAL_LINK_PROPS}
      >
        Use in the browser
      </a>
    </div>
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

        <div className="relative flex min-h-[720px] flex-col items-center justify-center px-6 py-14 text-center [text-shadow:0_2px_20px_rgba(255,255,255,0.45)] sm:min-h-[820px] md:min-h-[900px]">
          <h1
            className="rise text-balance font-serif text-5xl font-medium tracking-tight text-ink sm:text-6xl md:whitespace-nowrap md:text-7xl"
            style={riseDelay(0.05)}
          >
            Your life, in <span className="font-normal italic">one</span> place.
          </h1>
          <p
            className="rise mt-6 max-w-3xl text-balance text-base font-medium leading-relaxed text-ink sm:text-lg md:text-wrap"
            style={riseDelay(0.15)}
          >
            Calendar, money, health, tasks and the people you know, connected
            once. <br className="hidden md:block" />
            So Claude can finally help with your actual life.
          </p>
          <div className="rise mt-8" style={riseDelay(0.25)}>
            <SkyActions platform={platform} />
          </div>
        </div>
      </div>

      <div className="relative mx-auto -mt-[138px] max-w-5xl px-5 sm:-mt-52 sm:px-6 md:-mt-[254px]">
        <CompareChat className="rise" />
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="reveal flex flex-col items-center text-center">
      <span className="text-sm font-medium text-accent">{eyebrow}</span>
      <h2 className="mt-4 max-w-2xl text-balance font-serif text-3xl font-medium tracking-tight sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 max-w-xl text-balance text-base leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto w-full max-w-5xl scroll-mt-20 px-6 pt-32 sm:pt-44"
    >
      <SectionHeading
        eyebrow="How it works"
        title={
          <>
            Connect your life <span className="font-normal italic">once</span>.
          </>
        }
        subtitle="Bessel brings in what you already use and keeps it up to date. When you ask Claude something, it can look."
      />
      <div className="reveal mt-12 sm:mt-14">
        <ContextFlow />
      </div>
    </section>
  );
}

const QUESTIONS = [
  {
    question: "Why am I sleeping worse?",
    answer:
      "Mostly late workouts. On days you trained after 19:00 you fell asleep later and slept 35 minutes less.",
    from: "Sleep and workouts",
  },
  {
    question: "Prep me for my 2 pm.",
    answer:
      "It's with Erik and Maja. Last time Erik said he's moving to Berlin in May, and Maja turns 30 next Friday.",
    from: "Calendar and people",
  },
  {
    question: "Where did my money go?",
    answer:
      "18 240 kr this month, about as usual. Eating out is up 1 300 kr, mostly three dinners in the week of the 12th.",
    from: "Money",
  },
];

function Questions() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 pt-32 sm:pt-44">
      <SectionHeading
        eyebrow="What you can ask"
        title="Better answers about your own life"
        subtitle="Not generic advice, but answers built on what actually happened in your calendar, your accounts and your nights."
      />
      <div className="mt-12 grid gap-4 sm:mt-14 md:grid-cols-3">
        {QUESTIONS.map((q) => (
          <figure
            key={q.question}
            className="reveal flex flex-col rounded-2xl border border-white/[0.07] bg-surface p-6"
          >
            <blockquote className="font-serif text-lg leading-snug">
              &ldquo;{q.question}&rdquo;
            </blockquote>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {q.answer}
            </p>
            <figcaption className="mt-auto pt-4 text-xs text-faint-foreground">
              From your {q.from.toLowerCase()}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

const PROMISES = [
  {
    icon: <Eye className="size-4.5" />,
    title: "You choose what it sees",
    description:
      "Nothing comes in until you connect it, and you can disconnect anything again.",
  },
  {
    icon: <ShieldCheck className="size-4.5" />,
    title: "Claude can't delete anything",
    description:
      "It can read, and add tasks, events and notes when you ask. Removing things is up to you.",
  },
  {
    icon: <FileCode className="size-4.5" />,
    title: "Every line is open to read",
    description:
      "Bessel's code is on GitHub, so you can see exactly what happens with your data.",
  },
];

function Privacy() {
  return (
    <section
      id="privacy"
      className="mx-auto w-full max-w-5xl scroll-mt-20 px-6 pt-32 sm:pt-44"
    >
      <SectionHeading
        eyebrow="Privacy"
        title={
          <>
            It&rsquo;s your life. You stay in{" "}
            <span className="font-normal italic">charge</span>.
          </>
        }
        subtitle="Bessel only knows what you connect, and Claude only looks when you ask it something."
      />
      <div className="mt-12 grid gap-8 sm:mt-14 sm:grid-cols-3 sm:gap-6">
        {PROMISES.map((promise) => (
          <div
            key={promise.title}
            className="reveal flex flex-col items-center text-center"
          >
            <span className="flex size-10 items-center justify-center rounded-full border border-white/[0.08] bg-surface text-accent">
              {promise.icon}
            </span>
            <h3 className="mt-4 text-[15px] font-medium">{promise.title}</h3>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {promise.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

const PLATFORMS: { id: Platform; icon: ReactNode; detail: string }[] = [
  {
    id: "mac",
    icon: <AppleLogo className="size-4" />,
    detail: "Apple Silicon",
  },
  { id: "windows", icon: <WindowsLogo className="size-4" />, detail: "64-bit" },
  { id: "linux", icon: <LinuxLogo className="size-4" />, detail: "AppImage" },
];

function TheApp() {
  const detected = usePlatform();
  return (
    <section
      id="download"
      className="mx-auto w-full max-w-5xl scroll-mt-20 px-6 pt-32 sm:pt-44"
    >
      <SectionHeading
        eyebrow="The app"
        title="And a place to see it yourself"
        subtitle="Your day at a glance on your computer or in the browser. An iPhone app is on the way."
      />
      <TodayPreview className="reveal mx-auto mt-12 max-w-2xl sm:mt-14" />
      <div className="reveal mt-10 flex flex-wrap items-center justify-center gap-2">
        {PLATFORMS.map((p) => (
          <a
            key={p.id}
            href={platformDownloadUrl(p.id)}
            className={`flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm transition-[transform,border-color,background-color] duration-150 ease-out-strong active:scale-[0.97] ${
              p.id === detected
                ? "border-accent/40 bg-accent/[0.08] text-foreground pointer-fine:hover:border-accent/60"
                : "border-white/[0.1] text-muted-foreground pointer-fine:hover:border-white/25 pointer-fine:hover:text-foreground"
            }`}
            download
          >
            {p.icon}
            {PLATFORM_LABEL[p.id]}
            <span className="text-xs text-faint-foreground">{p.detail}</span>
            <DownloadIcon className="size-3.5 text-faint-foreground" />
          </a>
        ))}
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Or{" "}
        <a
          href={APP_URL}
          className="text-foreground underline decoration-white/25 underline-offset-2 pointer-fine:hover:decoration-white/50"
          {...EXTERNAL_LINK_PROPS}
        >
          use it in the browser
        </a>
        . It updates itself.
      </p>
    </section>
  );
}

function Closing() {
  const platform = usePlatform() ?? "mac";
  return (
    <section className="relative isolate mt-24 w-full overflow-hidden">
      <img
        src={heroSky}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-[center_30%] [mask-image:linear-gradient(to_bottom,transparent_0%,#000_30%,#000_75%,transparent_100%)]"
      />
      <div className="relative flex min-h-[480px] flex-col items-center justify-center px-6 text-center [text-shadow:0_2px_20px_rgba(255,255,255,0.45)] sm:min-h-[532px]">
        <h2 className="reveal max-w-2xl text-balance font-serif text-4xl font-medium tracking-tight text-ink sm:text-6xl">
          Give your AI the <span className="font-normal italic">context</span>.
        </h2>
        <p className="reveal mt-5 max-w-md text-balance text-base font-medium text-ink">
          Free to use. Connect what you already have, then ask.
        </p>
        <div className="reveal mt-8">
          <SkyActions platform={platform} />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-background">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 sm:grid-cols-[1fr_auto_auto] sm:gap-20">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-xs text-sm text-faint-foreground">
            The context your AI is missing.
          </p>
        </div>
        <FooterColumn
          title="Product"
          links={[
            { label: "How it works", href: "#how-it-works" },
            { label: "Privacy", href: "#privacy" },
            { label: "Download", href: "#download" },
          ]}
        />
        <FooterColumn
          title="Resources"
          links={[
            { label: "GitHub", href: GITHUB_URL },
            { label: "Releases", href: DOWNLOAD_URL },
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

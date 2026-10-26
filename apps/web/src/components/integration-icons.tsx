import type { ReactNode } from "react";
import { BankLogo } from "@/components/bank-logo";
import { cn } from "@/lib/utils";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.5 5.5 0 0 1-2.4 3.62v3h3.88c2.27-2.1 3.57-5.18 3.57-8.65z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3A7.2 7.2 0 0 1 12 19.25a7.13 7.13 0 0 1-6.72-4.93H1.27v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.32a7.2 7.2 0 0 1 0-4.64v-3.1H1.27a12 12 0 0 0 0 10.84z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.97 11.97 0 0 0 1.27 6.58l4.01 3.1A7.13 7.13 0 0 1 12 4.75z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
      <path d="M16.37 12.6c.02 2.6 2.28 3.47 2.3 3.48-.02.06-.36 1.24-1.19 2.45-.72 1.05-1.47 2.09-2.65 2.11-1.16.02-1.53-.69-2.86-.69-1.33 0-1.74.67-2.84.71-1.14.04-2.01-1.13-2.74-2.17-1.49-2.15-2.63-6.07-1.1-8.72a4.25 4.25 0 0 1 3.6-2.18c1.12-.02 2.18.76 2.86.76.69 0 1.97-.94 3.33-.8.57.02 2.17.23 3.2 1.74-.08.05-1.91 1.12-1.89 3.33zM14.17 6.22c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.55 1.31-.56.64-1.05 1.67-.92 2.66.97.07 1.96-.49 2.57-1.21z" />
    </svg>
  );
}

/** A 28px tile for an integration: a brand mark where there is one, else an icon on a tint. */
export function IntegrationIcon({
  kind,
  name,
  icon,
  tint,
}: {
  kind: "google" | "apple" | "bank" | "icon";
  name?: string;
  icon?: ReactNode;
  /** Tailwind classes for the tile behind a plain icon. */
  tint?: string;
}) {
  if (kind === "bank") return <BankLogo name={name ?? ""} size="sm" />;
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
        kind === "google" && "bg-white",
        kind === "apple" && "bg-white/10 text-white/90",
        kind === "icon" && (tint ?? "bg-white/[0.06] text-white/70"),
      )}
    >
      {kind === "google" ? (
        <GoogleMark />
      ) : kind === "apple" ? (
        <AppleMark />
      ) : (
        icon
      )}
    </span>
  );
}

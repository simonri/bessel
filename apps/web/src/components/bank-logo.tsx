import { useState } from "react";
import { cn } from "@/lib/utils";

// Each brand's own square app icon, kept with the app: banks' listed logos are
// wide wordmarks that turn tiny in a square tile.
const BRAND_ICONS: Record<string, string> = {
  avanza: "/brands/avanza.png",
  klarna: "/brands/klarna.png",
  marginalen: "/brands/marginalen.png",
  montrose: "/brands/montrose.png",
  skandia: "/brands/skandia.png",
};

const SIZES = {
  sm: "size-7 rounded-lg text-11",
  md: "size-9 rounded-xl text-12",
  lg: "size-12 rounded-2xl text-15",
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2))
    .toUpperCase()
    .slice(0, 2);
}

/** The brand's icon for a known brand ("Klarna pay later" is Klarna's). */
export function brandIcon(name: string): string | undefined {
  return BRAND_ICONS[name.trim().split(/\s+/)[0]?.toLowerCase() ?? ""];
}

/**
 * A bank's logo: a known brand's own icon filling the tile, any other bank's
 * listed logo on a white tile, or its initials when there's neither.
 */
export function BankLogo({
  name,
  logo,
  size = "md",
  className,
}: {
  name: string;
  logo?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const icon = brandIcon(name);
  const src = [icon, logo].find(
    (candidate) => candidate && !failed.includes(candidate),
  );
  if (src) {
    const full = src === icon;
    return (
      <span
        data-variant={full ? "brand" : "listed"}
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden",
          // A faint edge over the icon, so a dark one doesn't melt into the page.
          full
            ? "relative after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-white/10 after:ring-inset"
            : "bg-white p-0.5",
          SIZES[size],
          className,
        )}
      >
        <img
          src={src}
          alt=""
          className={cn("size-full", full ? "object-cover" : "object-contain")}
          loading="lazy"
          onError={() => setFailed((current) => [...current, src])}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      data-variant="initials"
      className={cn(
        "flex shrink-0 items-center justify-center bg-white/[0.08] font-semibold text-white/70",
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

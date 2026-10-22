import { useState } from "react";
import { cn } from "@/lib/utils";

// Brands without a logo URL still get their own colour, so they're told apart at a glance.
const BRAND_COLORS: Record<string, string> = {
  avanza: "#00c281",
  klarna: "#ffa8cd",
  montrose: "#1f3a5f",
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

/** A bank's logo on a white tile, or its initials when there's no logo. */
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
  const [failed, setFailed] = useState(false);
  const brand = BRAND_COLORS[name.toLowerCase()];
  if (logo && !failed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden bg-white p-0.5",
          SIZES[size],
          className,
        )}
      >
        <img
          src={logo}
          alt=""
          className="size-full object-contain"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold",
        brand ? "text-black/80" : "bg-white/[0.08] text-white/70",
        SIZES[size],
        className,
      )}
      style={brand ? { backgroundColor: brand } : undefined}
    >
      {initials(name)}
    </span>
  );
}

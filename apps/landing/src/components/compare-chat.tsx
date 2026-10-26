import type { ReactNode } from "react";
import { BesselMark } from "@/components/logo";

const QUESTION = "Can I afford a weekend in Lisbon next month?";

function Panel({
  label,
  highlighted,
  children,
}: {
  label: ReactNode;
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <figure
      className={`relative flex flex-col overflow-hidden rounded-2xl border backdrop-blur-md ${
        highlighted
          ? "border-accent/30 bg-[#14110f]/90 shadow-[0_30px_90px_-30px_rgba(249,115,22,0.35)]"
          : "border-white/[0.08] bg-[#101116]/85"
      }`}
    >
      <figcaption className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3 text-xs font-medium text-muted-foreground">
        {label}
      </figcaption>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <p className="ml-auto max-w-[95%] rounded-2xl rounded-br-md bg-white/[0.08] px-4 py-2.5 text-sm text-foreground">
          {QUESTION}
        </p>
        {children}
      </div>
    </figure>
  );
}

/** The same question asked of Claude alone and of Claude with Bessel. */
export function CompareChat({ className }: { className?: string }) {
  return (
    <div className={`grid gap-4 md:grid-cols-2 ${className ?? ""}`}>
      <Panel label="Claude on its own">
        <p className="max-w-[92%] text-sm leading-relaxed text-white/45">
          I can&rsquo;t see your finances or your calendar, so I can&rsquo;t say
          for sure. A good rule of thumb is to look at what&rsquo;s left after
          your fixed costs, and check that the dates are free.
        </p>
      </Panel>
      <Panel
        highlighted
        label={
          <>
            <BesselMark className="size-3.5 text-accent" />
            <span className="text-foreground">Claude with Bessel</span>
          </>
        }
      >
        <p className="max-w-[92%] text-sm leading-relaxed text-foreground/90">
          Yes. You&rsquo;ve spent about 4&nbsp;000&nbsp;kr less than usual this
          month. The 14th&ndash;16th clashes with Anna&rsquo;s birthday dinner,
          but the weekend after is free. Want me to put it in your calendar?
        </p>
        <p className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {["Money", "Calendar", "People"].map((source) => (
            <span
              key={source}
              className="rounded-full border border-accent/20 bg-accent/[0.07] px-2.5 py-0.5 text-[11px] text-accent-soft"
            >
              {source}
            </span>
          ))}
        </p>
      </Panel>
    </div>
  );
}

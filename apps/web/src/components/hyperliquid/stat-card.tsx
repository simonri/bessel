import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { pastel } from "./coin-badge";

export function StatCard({
  icon: Icon,
  hue,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  hue: number;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/[0.06] transition-colors duration-200 hover:bg-white/[0.06]">
      <div className="flex items-center gap-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: pastel(hue, 0.16), color: pastel(hue) }}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="truncate text-11 font-medium text-white/50">
          {label}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold tabular-nums tracking-tight text-white/90">
          {value}
        </p>
        <p className="truncate text-11 text-white/40">{detail ?? " "}</p>
      </div>
    </div>
  );
}

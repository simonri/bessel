import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// App-wide building blocks for settings and page content. Everything here is
// tuned for the dark chrome (white-alpha text/borders on glass or panel
// surfaces) and stays legible when a page is squeezed into a canvas widget.

export function Panel({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function PanelRow({
  label,
  description,
  children,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3.5",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-13 text-white/80">{label}</p>
        {description && (
          <p className="mt-0.5 truncate text-11 text-white/45">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}

export function SectionLabel({
  children,
  action,
  className,
}: {
  children: ReactNode;
  /** Right-aligned, e.g. a count or a small link button. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-2.5 flex items-center justify-between gap-2",
        className,
      )}
    >
      <p className="text-11 font-semibold tracking-wide text-white/40">
        {children}
      </p>
      {action}
    </div>
  );
}

/** Compact header row at the top of a page body: context on the left, controls on the right. */
export function PageToolbar({
  description,
  children,
  className,
}: {
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
        className,
      )}
    >
      {description ? (
        <p className="min-w-0 text-12 text-white/50">{description}</p>
      ) : (
        <span />
      )}
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-13 text-white/85 outline-none transition-colors duration-150 placeholder:text-white/25 hover:border-white/15 focus:border-primary-500/50 focus:bg-white/[0.06]",
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  destructive,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-white/40 outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5",
        destructive
          ? "hover:bg-red-500/10 hover:text-red-400"
          : "hover:bg-white/[0.06] hover:text-white/85",
        className,
      )}
      {...props}
    />
  );
}

export function SoftButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md bg-white/[0.06] px-2.5 text-12 font-medium text-white/75 transition-colors duration-150 hover:bg-white/[0.1] hover:text-white/90 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export function PrimaryButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-primary-500/25 bg-primary-500/10 px-4 text-12 font-medium text-primary-300 transition-colors duration-150 hover:border-primary-500/40 hover:bg-primary-500/[0.16] hover:text-primary-200 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  children,
  className,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-1 flex size-8 items-center justify-center rounded-lg bg-white/[0.05] text-white/40 [&_svg]:size-4">
          {icon}
        </div>
      )}
      {title && <p className="text-13 font-medium text-white/70">{title}</p>}
      {children && <div className="text-12 text-white/40">{children}</div>}
    </div>
  );
}

/** Previous / label / next stepper for date ranges. */
export function PeriodNav({
  label,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  className,
}: {
  label: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-8 items-center rounded-lg border border-white/10 bg-white/[0.03]",
        className,
      )}
    >
      <IconButton
        onClick={onPrev}
        disabled={prevDisabled}
        title="Previous"
        className="h-full rounded-r-none"
      >
        <ChevronLeft />
      </IconButton>
      <span className="min-w-28 px-1 text-center text-12 font-medium tabular-nums text-white/80">
        {label}
      </span>
      <IconButton
        onClick={onNext}
        disabled={nextDisabled}
        title="Next"
        className="h-full rounded-l-none"
      >
        <ChevronRight />
      </IconButton>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3",
        className,
      )}
    >
      <p className="truncate text-11 text-white/45">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums text-white/90">
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-11 text-white/40">{hint}</p>}
    </div>
  );
}

/** One labelled horizontal bar in a ranked list (activity by app, sleep by night…). */
export function BarRow({
  label,
  fraction,
  value,
  detail,
  color,
}: {
  label: ReactNode;
  /** 0–1, relative to the longest bar in the list. */
  fraction: number;
  value: ReactNode;
  detail?: ReactNode;
  /** Any CSS color; defaults to the accent. */
  color?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="w-1/3 max-w-44 shrink-0 truncate text-12 text-white/70">
        {label}
      </span>
      <div className="relative h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            !color && "bg-primary-500",
          )}
          style={{
            width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
            background: color,
          }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-12 tabular-nums text-white/70">
        {value}
      </span>
      {detail !== undefined && (
        <span className="w-10 shrink-0 text-right text-11 tabular-nums text-white/40">
          {detail}
        </span>
      )}
    </div>
  );
}

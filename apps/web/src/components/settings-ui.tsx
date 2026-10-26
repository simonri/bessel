import { Spinner } from "@bessel/ui/components/spinner";
import { Switch } from "@bessel/ui/components/switch";
import type { ReactNode } from "react";
import { PrimaryButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/** A settings page's title, with the page's own controls on the right. */
export function SettingsPageHeader({
  title,
  beside,
  children,
}: {
  title: ReactNode;
  /** Sits right after the title, e.g. tabs. */
  beside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex items-center gap-4">
        <h2 className="type-title text-white/90">{title}</h2>
        {beside}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </header>
  );
}

/** A titled group of settings rows, separated by thin lines. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="text-15 font-semibold text-white/90">{title}</h3>
      {description && (
        <p className="mt-1 text-12 text-white/45">{description}</p>
      )}
      <div className="mt-2 divide-y divide-white/[0.07]">{children}</div>
    </section>
  );
}

/** One setting: what it is on the left, its control on the right. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** The id of the control, so the label focuses it. */
  htmlFor?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-13 text-white/85">
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-12 text-white/45">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}

export function SettingsToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingsRow label={label} description={description}>
      <Switch
        size="sm"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </SettingsRow>
  );
}

type StatusTone = "neutral" | "active" | "warning" | "error";

const TONE_DOT: Record<StatusTone, string> = {
  neutral: "bg-white/20",
  active: "bg-emerald-400",
  warning: "bg-amber-400",
  error: "bg-red-400",
};

export function StatusDot({ tone = "neutral" }: { tone?: StatusTone }) {
  return (
    <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
  );
}

export function SettingsHint({ children }: { children: ReactNode }) {
  return <p className="mt-2.5 text-center text-11 text-white/40">{children}</p>;
}

export function SettingsError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="text-12 text-red-400">{children}</p>;
}

export function SettingsInstallCta({
  loading,
  onInstall,
  label,
  loadingLabel,
  hint,
}: {
  loading: boolean;
  onInstall: () => void;
  label: string;
  loadingLabel: string;
  hint: string;
}) {
  return (
    <div className="text-center">
      <PrimaryButton onClick={onInstall} disabled={loading}>
        {loading ? loadingLabel : label}
      </PrimaryButton>
      <SettingsHint>{hint}</SettingsHint>
    </div>
  );
}

export function SettingsLoading() {
  return (
    <div className="flex items-center justify-center py-10">
      <Spinner className="size-4 text-white/40" />
    </div>
  );
}

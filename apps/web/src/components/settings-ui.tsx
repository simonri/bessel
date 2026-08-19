import { Spinner } from "@bessel/ui/components/spinner";
import { Switch } from "@bessel/ui/components/switch";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsRow({
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
        <p className="text-13 text-white/65">{label}</p>
        {description && (
          <p className="mt-0.5 truncate text-11 text-white/40">{description}</p>
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

export function SettingsButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] px-2.5 text-11 font-medium text-white/70 transition-colors duration-150 hover:bg-white/[0.11] hover:text-white/90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export function SettingsPrimaryButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-lg border border-primary-500/25 bg-primary-500/10 px-4 text-12 font-medium text-primary-300 transition-all duration-150 hover:border-primary-500/40 hover:bg-primary-500/[0.16] hover:text-primary-200 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100",
        className,
      )}
      {...props}
    />
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
      <SettingsPrimaryButton onClick={onInstall} disabled={loading}>
        {loading ? loadingLabel : label}
      </SettingsPrimaryButton>
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

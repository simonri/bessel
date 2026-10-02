import { Spinner } from "@bessel/ui/components/spinner";
import { Switch } from "@bessel/ui/components/switch";
import type { ReactNode } from "react";
import { PanelRow, PrimaryButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

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
    <PanelRow label={label} description={description}>
      <Switch
        size="sm"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </PanelRow>
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

import type { ReactNode } from "react";

export function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-white/35" />
      <div className="min-w-0 flex-1">
        <h3 className="mb-1 text-11 text-white/40">{title}</h3>
        {children}
      </div>
    </section>
  );
}

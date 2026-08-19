import { Button } from "@bessel/ui/components/button";

export function ProjectFilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={`h-auto rounded px-2.5 py-1 text-11 font-medium whitespace-nowrap ${
        active
          ? "bg-white/10 text-white/80 hover:bg-white/10"
          : "text-white/50 hover:bg-transparent hover:text-white/60"
      }`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

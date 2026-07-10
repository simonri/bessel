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
    <button
      type="button"
      className={`px-2.5 py-1 text-11 font-medium rounded transition-colors whitespace-nowrap ${
        active
          ? "bg-white/10 text-white/80"
          : "text-white/50 hover:text-white/60"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

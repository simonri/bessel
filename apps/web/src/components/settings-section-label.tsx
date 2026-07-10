export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-semibold tracking-widest text-white/30">
      {children}
    </p>
  );
}

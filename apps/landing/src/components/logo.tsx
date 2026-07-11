export function BesselMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M2 12C3.2 5.5 4.8 5.5 6 12C7.2 18.5 8.8 18.5 10 12C10.9 7.4 12.1 7.4 13 12C13.9 15.4 15.1 15.4 16 12C16.7 9.6 17.8 9.6 18.5 12C19.1 13.8 19.9 13.8 20.5 12C20.9 10.9 21.5 10.9 22 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(0, 1.5)"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <BesselMark className="size-5 text-accent" />
      <span className="text-[15px] font-medium tracking-tight">Bessel</span>
    </span>
  );
}

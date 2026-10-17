import { type ReactNode, useEffect } from "react";

/** The small-screen sidebar the top bar's menu button opens. */
export const NAV_ID = "app-nav";

/** The sidebar over the page on small screens; a tap outside or Escape closes it. */
export function MobileNavDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 z-30 bg-black/50"
      />
      <div id={NAV_ID} className="absolute inset-y-0 left-0 z-40">
        {children}
      </div>
    </>
  );
}

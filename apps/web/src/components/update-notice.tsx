import { useEffect } from "react";
import { toast } from "sonner";

const TOAST_ID = "update-ready";

function showUpdateReady(version: string) {
  toast(`Bessel ${version} is ready`, {
    id: TOAST_ID,
    description: "Restart to start using it. Claude sessions keep running.",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Restart",
      onClick: () => void window.electron?.update.install(),
    },
  });
}

/** Offers the restart once the desktop app has downloaded an update in the background. */
export function UpdateNotice() {
  useEffect(() => {
    const update = window.electron?.update;
    if (!update) return;
    void update.ready().then((version) => {
      if (version) showUpdateReady(version);
    });
    return update.onReady(showUpdateReady);
  }, []);

  return null;
}

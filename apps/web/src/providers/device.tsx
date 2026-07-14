import { useEffect } from "react";
import { client } from "@/lib/client";
import { isDesktop } from "@/lib/environment";

// Project paths/ssh hosts resolve per-device on the backend (see
// api/projects/service.py) — this tags every request with the id Electron's
// main process persisted in userData/device.json, so the API knows which
// device is asking. No-op outside the desktop app.
export function DeviceInterceptor() {
  useEffect(() => {
    if (!isDesktop) return;

    let deviceInfo: { key: string; name: string } | null = null;

    const id = client.interceptors.request.use(async (request) => {
      deviceInfo ??= await window.electron!.device.getInfo();
      request.headers.set("X-Device-Id", deviceInfo.key);
      request.headers.set("X-Device-Name", deviceInfo.name);
      return request;
    });

    return () => {
      client.interceptors.request.eject(id);
    };
  }, []);

  return null;
}

import { useEffect, useState } from "react";

/**
 * A local URL for a file the API serves behind its bearer token: a plain
 * <img src> can't send it, so the file is fetched through the client and shown
 * from a blob instead. Released when the key changes or the component goes.
 */
export function useBlobUrl(
  key: string | null,
  load: () => Promise<unknown>,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void load().then((data) => {
      if (cancelled || !(data instanceof Blob)) return;
      objectUrl = URL.createObjectURL(data);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [key]);
  return url;
}

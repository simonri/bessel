import { useEffect, useState } from "react";

export interface BlobUrl {
  url: string | null;
  /** The file couldn't be fetched, so `url` won't come. */
  failed: boolean;
}

/**
 * A local URL for a file the API serves behind its bearer token: a plain
 * <img src> can't send it, so the file is fetched through the client and shown
 * from a blob instead. Released when the key changes or the component goes.
 */
export function useBlobUrl(
  key: string | null,
  load: () => Promise<unknown>,
): BlobUrl {
  const [state, setState] = useState<BlobUrl>({ url: null, failed: false });
  useEffect(() => {
    if (!key) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    load().then(
      (data) => {
        if (cancelled) return;
        if (!(data instanceof Blob)) {
          setState({ url: null, failed: true });
          return;
        }
        objectUrl = URL.createObjectURL(data);
        setState({ url: objectUrl, failed: false });
      },
      () => {
        if (!cancelled) setState({ url: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setState({ url: null, failed: false });
    };
  }, [key]);
  return state;
}

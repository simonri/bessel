import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TOPBAR_DIVIDER, TOPBAR_ICON_BUTTON } from "./topbar-styles";

const SPOTIFY_STATUS_QUERY_KEY = ["spotify-status"];
const SPOTIFY_BUTTON = cn(TOPBAR_ICON_BUTTON, "size-6 [&_svg]:size-3.5");

// Only the fields this widget renders. MPRIS emits several duplicate
// PropertiesChanged per track change, each carrying a different position —
// projecting the push down to these fields lets TanStack Query's structural
// sharing coalesce those duplicates into zero re-renders.
interface ProjectedSpotifyStatus {
  running: boolean;
  playing?: boolean;
  title?: string;
  artist?: string;
  coverUrl?: string;
}

// Spotify cover ids encode the size: "…b273…" is 640px, "…4851…" is 64px —
// plenty for a 20px thumbnail on a 2x screen. Older clients report a dead
// open.spotify.com/image/<id> URL for the same image.
const ALBUM_ART_640 = "ab67616d0000b273";
const ALBUM_ART_64 = "ab67616d00004851";

export function thumbnailUrl(artUrl: string | undefined): string | undefined {
  if (!artUrl) return undefined;
  const url = artUrl.replace(
    "https://open.spotify.com/image/",
    "https://i.scdn.co/image/",
  );
  return url.startsWith("https://i.scdn.co/image/")
    ? url.replace(ALBUM_ART_640, ALBUM_ART_64)
    : undefined;
}

function projectStatus(status: {
  running: boolean;
  playing?: boolean;
  title?: string;
  artist?: string;
  artUrl?: string;
}): ProjectedSpotifyStatus {
  return {
    running: status.running,
    playing: status.playing,
    title: status.title,
    artist: status.artist,
    coverUrl: thumbnailUrl(status.artUrl),
  };
}

function Cover({ url }: { url: string | undefined }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) return null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      onError={() => setFailed(url)}
      className="ml-1 size-5 shrink-0 rounded-[3px] object-cover ring-1 ring-white/10"
    />
  );
}
// Backstop only — the main process pushes a status update the instant Spotify's
// own D-Bus signal fires, normally well under a second. This just guarantees the
// optimistic icon doesn't get stuck if a push is ever lost (e.g. Spotify closes
// mid-click).
const OPTIMISTIC_TIMEOUT_MS = 4000;

export function SpotifyWidget() {
  const queryClient = useQueryClient();
  const [optimisticPlaying, setOptimisticPlaying] = useState<boolean | null>(
    null,
  );
  // Tracks which "playing" value our own pending click expects, so a stray
  // push that arrives before our own change propagates doesn't clear the
  // optimistic icon to the wrong state for a frame.
  const pendingPlaying = useRef<boolean | null>(null);
  const optimisticTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data } = useQuery({
    queryKey: SPOTIFY_STATUS_QUERY_KEY,
    queryFn: async () =>
      projectStatus(await window.electron!.spotify.getStatus()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  // The 4s optimistic backstop must not fire setState after unmount.
  useEffect(
    () => () => {
      if (optimisticTimer.current) clearTimeout(optimisticTimer.current);
    },
    [],
  );

  useEffect(() => {
    return window.electron!.spotify.onStatusChange((status) => {
      queryClient.setQueryData(SPOTIFY_STATUS_QUERY_KEY, projectStatus(status));
      if (
        pendingPlaying.current === null ||
        status.playing === pendingPlaying.current
      ) {
        pendingPlaying.current = null;
        setOptimisticPlaying(null);
        if (optimisticTimer.current) {
          clearTimeout(optimisticTimer.current);
          optimisticTimer.current = null;
        }
      }
    });
  }, [queryClient]);

  if (!data?.running) return null;

  const isPlaying = optimisticPlaying ?? data.playing ?? false;

  const togglePlayPause = () => {
    const next = !isPlaying;
    pendingPlaying.current = next;
    setOptimisticPlaying(next);
    window.electron!.spotify.playPause();

    if (optimisticTimer.current) clearTimeout(optimisticTimer.current);
    optimisticTimer.current = setTimeout(() => {
      pendingPlaying.current = null;
      setOptimisticPlaying(null);
    }, OPTIMISTIC_TIMEOUT_MS);
  };

  const skip = () => {
    window.electron!.spotify.next();
  };

  return (
    <>
      <div className={TOPBAR_DIVIDER} />
      <div className="flex min-w-0 items-center gap-0.5">
        <button
          type="button"
          onClick={togglePlayPause}
          title={isPlaying ? "Pause" : "Play"}
          className={SPOTIFY_BUTTON}
        >
          {isPlaying ? <Pause /> : <Play />}
        </button>
        <button
          type="button"
          onClick={skip}
          title="Skip"
          className={SPOTIFY_BUTTON}
        >
          <SkipForward />
        </button>
        <Cover url={data.coverUrl} />
        <div className="ml-1.5 min-w-0 max-w-44 truncate text-xs text-white/70">
          {data.title}
          {data.artist && (
            <span className="text-white/50"> - {data.artist}</span>
          )}
        </div>
      </div>
    </>
  );
}

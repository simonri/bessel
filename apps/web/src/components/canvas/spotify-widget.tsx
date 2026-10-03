import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TOPBAR_ICON_BUTTON } from "./topbar-styles";

const SPOTIFY_STATUS_QUERY_KEY = ["spotify-status"];
const SPOTIFY_BUTTON = cn(
  TOPBAR_ICON_BUTTON,
  "size-6 rounded-full text-white/60 [&_svg]:size-3",
);

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
  lengthMs?: number;
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
  lengthMs?: number;
}): ProjectedSpotifyStatus {
  return {
    running: status.running,
    playing: status.playing,
    title: status.title,
    artist: status.artist,
    coverUrl: thumbnailUrl(status.artUrl),
    lengthMs: status.lengthMs,
  };
}

const PROGRESS_POLL_MS = 1000;

// Remounted per track (keyed on the URL), so a new cover fades in.
function Cover({ url }: { url: string | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <span className="size-6 shrink-0 rounded-md bg-white/[0.08]" />;
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className="size-6 shrink-0 rounded-md object-cover ring-1 ring-white/10 animate-in fade-in duration-500"
    />
  );
}

// A faint halo around the cover in its own colours — the cover itself,
// blurred, so it needs no pixel reading.
function CoverHalo({ url }: { url: string | undefined }) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      draggable={false}
      className="pointer-events-none absolute top-1 left-1 -z-10 size-6 scale-125 rounded-md object-cover opacity-40 blur-md animate-in fade-in duration-700"
    />
  );
}

function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span aria-hidden className="flex h-2.5 shrink-0 items-end gap-[2px]">
      {[0, 0.25, 0.5].map((delay) => (
        <span
          key={delay}
          className={cn(
            "h-full w-[2px] rounded-full bg-primary-400",
            playing ? "animate-equalizer" : "scale-y-[0.35]",
          )}
          style={playing ? { animationDelay: `${delay}s` } : undefined}
        />
      ))}
    </span>
  );
}

/** Polls the playback position while `active` (MPRIS never pushes it). */
function usePlaybackProgress(active: boolean, lengthMs: number | undefined) {
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => {
    const getPosition = window.electron?.spotify.getPositionMs;
    if (!active || !lengthMs || !getPosition) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    const read = () =>
      getPosition().then((ms) => {
        if (!cancelled)
          setProgress(ms === null ? null : Math.min(1, ms / lengthMs));
      });
    void read();
    const timer = setInterval(read, PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, lengthMs]);
  return progress;
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
  const [hovered, setHovered] = useState(false);

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

  const progress = usePlaybackProgress(
    hovered && Boolean(data?.running),
    data?.lengthMs,
  );

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
    <div
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className="relative isolate flex h-8 min-w-0 max-w-[26rem] items-center gap-2 rounded-full bg-white/[0.05] pr-1 pl-1 ring-1 ring-white/[0.07] backdrop-blur-md"
    >
      <CoverHalo key={`halo-${data.coverUrl}`} url={data.coverUrl} />
      <Cover key={data.coverUrl ?? "none"} url={data.coverUrl} />
      <Equalizer playing={isPlaying} />
      <div
        title={data.artist ? `${data.title} - ${data.artist}` : data.title}
        className="min-w-0 flex-1 truncate text-xs text-white/85"
      >
        {data.title}
        {data.artist && <span className="text-white/45"> - {data.artist}</span>}
      </div>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={togglePlayPause}
          aria-label={isPlaying ? "Pause" : "Play"}
          className={SPOTIFY_BUTTON}
        >
          {isPlaying ? (
            <Pause className="fill-current" />
          ) : (
            <Play className="fill-current" />
          )}
        </button>
        <button
          type="button"
          onClick={skip}
          aria-label="Skip"
          className={SPOTIFY_BUTTON}
        >
          <SkipForward className="fill-current" />
        </button>
      </div>
      {progress !== null && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] overflow-hidden rounded-full bg-white/10"
        >
          <span
            className="block h-full rounded-full bg-primary-400 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </span>
      )}
    </div>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const SPOTIFY_STATUS_QUERY_KEY = ["spotify-status"];
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
    queryFn: () => window.electron!.spotify.getStatus(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    return window.electron!.spotify.onStatusChange((status) => {
      queryClient.setQueryData(SPOTIFY_STATUS_QUERY_KEY, status);
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
      <div className="h-3 w-px shrink-0 bg-white/10" />
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          onClick={togglePlayPause}
          title={isPlaying ? "Pause" : "Play"}
          className="flex items-center justify-center rounded p-0.5 text-white/50 transition-colors hover:text-white/85"
        >
          {isPlaying ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </button>
        <button
          onClick={skip}
          title="Skip"
          className="flex items-center justify-center rounded p-0.5 text-white/50 transition-colors hover:text-white/85"
        >
          <SkipForward className="size-3.5" />
        </button>
        <div className="min-w-0 max-w-44 truncate font-mono text-11 text-white/60">
          {data.title}
          {data.artist && (
            <span className="text-white/50"> · {data.artist}</span>
          )}
        </div>
      </div>
    </>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, SkipForward } from "lucide-react";
import { useState } from "react";

const SPOTIFY_STATUS_QUERY_KEY = ["spotify-status"];

export function SpotifyWidget() {
  const queryClient = useQueryClient();
  const [optimisticPlaying, setOptimisticPlaying] = useState<boolean | null>(
    null,
  );

  const { data } = useQuery({
    queryKey: SPOTIFY_STATUS_QUERY_KEY,
    queryFn: () => window.electron!.spotify.getStatus(),
    refetchInterval: 2000,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: SPOTIFY_STATUS_QUERY_KEY });

  if (!data?.running) return null;

  const isPlaying = optimisticPlaying ?? data.playing ?? false;

  const togglePlayPause = async () => {
    setOptimisticPlaying(!isPlaying);
    try {
      await window.electron!.spotify.playPause();
    } finally {
      await refresh();
      setOptimisticPlaying(null);
    }
  };

  const skip = async () => {
    await window.electron!.spotify.next();
    refresh();
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
        <div className="min-w-0 max-w-44 truncate font-mono text-[11px] text-white/60">
          {data.title}
          {data.artist && (
            <span className="text-white/30"> · {data.artist}</span>
          )}
        </div>
      </div>
    </>
  );
}

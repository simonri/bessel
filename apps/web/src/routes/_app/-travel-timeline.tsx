import type { PlaceSchema } from "@metron/client";
import { formatDistanceToNow } from "date-fns";
import { Plane } from "lucide-react";
import { RatingStars } from "./-rating-stars";

export function TravelTimeline({
  places,
  onSelectPlace,
}: {
  places: PlaceSchema[];
  onSelectPlace: (place: PlaceSchema) => void;
}) {
  if (places.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <Plane className="mb-2 size-8 text-white/10" />
        <p className="text-xs text-white/50">No visited places yet</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Plane className="size-3.5 text-white/30" />
        <span className="text-11 font-medium text-white/50">
          Recent visits
        </span>
      </div>
      <div className="relative">
        <div className="absolute bottom-2 left-[11px] top-2 w-px bg-white/10" />
        <div className="space-y-0.5">
          {places.map((place, i) => {
            const a = place as Record<string, unknown>;
            const visitedAt = a.visited_at;
            const country = a.country as string | undefined;
            const isFirst = i === 0;

            let timeLabel = "";
            if (visitedAt) {
              try {
                const d =
                  visitedAt instanceof Date
                    ? visitedAt
                    : new Date(visitedAt as string);
                timeLabel = formatDistanceToNow(d, { addSuffix: true });
              } catch {
                timeLabel = "";
              }
            }

            return (
              <button
                key={place.id}
                type="button"
                className="group relative flex w-full items-start gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-white/[0.06]"
                onClick={() => onSelectPlace(place)}
              >
                <div className="relative z-10 mt-1 shrink-0">
                  <div
                    className={`size-[9px] rounded-full ring-2 ring-black ${
                      isFirst ? "bg-emerald-400" : "bg-white/20"
                    }`}
                  />
                </div>
                <div className="-mt-0.5 min-w-0 flex-1">
                  <div className="truncate text-sm font-medium leading-snug text-white/75 group-hover:text-white/90">
                    {place.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {country && (
                      <span className="truncate text-11 text-white/50">
                        {country}
                      </span>
                    )}
                    {country && place.category && (
                      <span className="text-11 text-white/20">/</span>
                    )}
                    {place.category && (
                      <span className="truncate text-11 capitalize text-white/50">
                        {place.category.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  {timeLabel && (
                    <span className="mt-0.5 block text-10 text-white/50">
                      {timeLabel}
                    </span>
                  )}
                </div>
                {place.rating && (
                  <div className="mt-0.5 shrink-0">
                    <RatingStars rating={place.rating} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

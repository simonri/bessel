import type { PlaceSchema } from "@bessel/client";
import { Map, Trash2 } from "lucide-react";
import { useState } from "react";
import { EditPlaceDialog } from "@/components/edit-place-dialog";
import { RatingStars } from "./-rating-stars";
import {
  formatVisitedDate,
  getCategoryIcon,
  getGoogleMapsUrl,
} from "./-travel-utils";

export function PlaceCard({
  place,
  isSelected,
  onSelect,
  onDelete,
}: {
  place: PlaceSchema;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const isVisited = place.status === "visited";
  const Icon = getCategoryIcon(place.category);
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!place.photo_url && !photoFailed;

  return (
    <div
      className={`group flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 ${
        isSelected
          ? "border-white/20 bg-white/[0.08]"
          : "border-white/[0.07] bg-white/[0.03] pointer-fine:hover:border-white/10 pointer-fine:hover:bg-white/[0.06]"
      }`}
      onClick={onSelect}
    >
      {showPhoto ? (
        <img
          src={place.photo_url!}
          alt=""
          loading="lazy"
          onError={() => setPhotoFailed(true)}
          className="size-9 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/[0.07]">
          <Icon className="size-4 text-white/45" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white/80">
          {place.name}
        </span>
        {(place.country || place.category) && (
          <span className="block truncate text-11 text-white/50">
            {[place.country, place.category?.replace(/_/g, " ")]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
      {place.rating && (
        <div className="hidden shrink-0 sm:block">
          <RatingStars rating={place.rating} />
        </div>
      )}
      {!isVisited && (
        <span className="hidden shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-10 font-medium text-amber-400/90 sm:block">
          want to go
        </span>
      )}
      {isVisited && !!place.visited_at && (
        <span className="hidden w-20 shrink-0 text-right text-10 tabular-nums text-white/50 sm:block">
          {formatVisitedDate(place.visited_at)}
        </span>
      )}
      <div
        className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={getGoogleMapsUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-6 w-6 items-center justify-center rounded text-white/30 transition-colors hover:text-white/70"
        >
          <Map className="size-3.5" />
        </a>
        <EditPlaceDialog place={place} />
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded text-white/30 transition-colors hover:text-red-400"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

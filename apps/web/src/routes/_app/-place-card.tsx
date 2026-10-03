import type { PlaceSchema, PlaceStatus } from "@bessel/client";
import { Map as MapIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { EditPlaceDialog } from "@/components/edit-place-dialog";
import { IconButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { RatingStars } from "./-rating-stars";
import {
  formatVisitedDate,
  getCategoryIcon,
  getGoogleMapsUrl,
} from "./-travel-utils";

export function StatusBadge({
  status,
  className,
}: {
  status?: PlaceStatus | null;
  className?: string;
}) {
  const visited = status === "visited";
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-11 font-medium",
        visited
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-primary-500/10 text-primary-300",
        className,
      )}
    >
      {visited ? "Visited" : "Want to go"}
    </span>
  );
}

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
      className={cn(
        "group flex min-w-0 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors duration-150",
        isSelected
          ? "relative bg-white/[0.07] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary-400"
          : "pointer-fine:hover:bg-white/[0.04]",
      )}
      onClick={onSelect}
    >
      {showPhoto ? (
        <img
          src={place.photo_url!}
          alt=""
          loading="lazy"
          onError={() => setPhotoFailed(true)}
          className="size-9 shrink-0 rounded-lg border border-white/[0.07] object-cover"
        />
      ) : (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04]">
          <Icon className="size-4 text-white/40" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-13 font-medium text-white/85">
          {place.name}
        </span>
        {(place.country || place.category) && (
          <span className="block truncate text-12 capitalize text-white/45">
            {[place.country, place.category?.replace(/_/g, " ")]
              .filter(Boolean)
              .join(" - ")}
          </span>
        )}
      </div>
      {place.rating && (
        <div className="hidden shrink-0 @md:block">
          <RatingStars rating={place.rating} />
        </div>
      )}
      {!isVisited && (
        <StatusBadge status={place.status} className="hidden @md:inline-flex" />
      )}
      {isVisited && !!place.visited_at && (
        <span className="hidden w-20 shrink-0 text-right text-11 tabular-nums text-white/40 @md:block">
          {formatVisitedDate(place.visited_at)}
        </span>
      )}
      <div
        className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={getGoogleMapsUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Google Maps"
          className="flex size-7 items-center justify-center rounded-md text-white/40 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/85"
        >
          <MapIcon className="size-3.5" />
        </a>
        <EditPlaceDialog place={place} />
        <IconButton destructive title="Delete" onClick={onDelete}>
          <Trash2 />
        </IconButton>
      </div>
    </div>
  );
}

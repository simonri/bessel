import { lazy, Suspense, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Trash2, Star, MapPin, X, Map, Check, Plane, Pencil,
  UtensilsCrossed, Coffee, Beer, ShoppingBag, Hotel, Trees, Landmark,
  Drama, Church, Building2, Dumbbell, Wine, IceCream, Store, ChevronLeft, ChevronRight,
  type LucideIcon,
} from "lucide-react";
import type { PlaceSchema } from "@metron/client";
import {
  listPlacesV1PlacesGetOptions,
  listPlacesV1PlacesGetQueryKey,
  deletePlaceV1PlacesPlaceIdDeleteMutation,
  updatePlaceV1PlacesPlaceIdPatchMutation,
} from "@metron/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metron/ui/components/alert-dialog";

import { AddPlaceDialog } from "@/components/add-place-dialog";
import { EditPlaceDialog } from "@/components/edit-place-dialog";
const PlaceMap = lazy(() =>
  import("@/components/place-map").then((m) => ({ default: m.PlaceMap })),
);
import { TagDisplay } from "@/components/tag-input";
import { toast } from "sonner";
import { client } from "@/lib/client";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  bar: Beer,
  nightclub: Wine,
  shopping: ShoppingBag,
  hotel: Hotel,
  park: Trees,
  landmark: Landmark,
  museum: Landmark,
  theater: Drama,
  temple: Church,
  church: Church,
  mosque: Church,
  synagogue: Church,
  gym: Dumbbell,
  bakery: IceCream,
  market: Store,
  gallery: Building2,
};

function getCategoryIcon(category: string | null | undefined): LucideIcon {
  if (!category) return MapPin;
  return CATEGORY_ICONS[category] ?? MapPin;
}

export const Route = createFileRoute("/_app/travel")({
  component: Travel,
});

function formatVisitedDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return format(value, "MMM d, yyyy");
  if (typeof value === "string") return format(new Date(value), "MMM d, yyyy");
  return "";
}

function getGoogleMapsUrl(place: PlaceSchema): string {
  const placeAny = place as Record<string, unknown>;
  if (typeof placeAny.google_place_id === "string") {
    return `https://www.google.com/maps/place/?q=place_id:${placeAny.google_place_id}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
}

function RatingStars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const s = size === "sm" ? "size-3" : "size-4";
  return (
    <div className="flex items-center gap-px">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${s} ${i < rating ? "fill-yellow-500 text-yellow-500" : "text-white/15"}`}
        />
      ))}
    </div>
  );
}

function getPlaceAny(place: PlaceSchema) {
  const a = place as Record<string, unknown>;
  return {
    country: a.country as string | undefined,
    status: a.status as string,
    visitedAt: a.visited_at,
    googlePlaceId: a.google_place_id as string | undefined,
    tags: Array.isArray(a.tags) ? (a.tags as string[]) : [],
  };
}

// ---------------------------------------------------------------------------
// Travel Timeline
// ---------------------------------------------------------------------------

function TravelTimeline({
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
        <p className="text-xs text-white/25">No visited places yet</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Plane className="size-3.5 text-white/30" />
        <span className="text-[11px] font-medium text-white/30">Recent visits</span>
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
                const d = visitedAt instanceof Date ? visitedAt : new Date(visitedAt as string);
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
                      <span className="truncate text-[11px] text-white/35">{country}</span>
                    )}
                    {country && place.category && (
                      <span className="text-[11px] text-white/20">/</span>
                    )}
                    {place.category && (
                      <span className="truncate text-[11px] capitalize text-white/25">
                        {place.category.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  {timeLabel && (
                    <span className="mt-0.5 block text-[10px] text-white/20">{timeLabel}</span>
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

// ---------------------------------------------------------------------------
// Place Card
// ---------------------------------------------------------------------------

function PlaceCard({
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
  const { country, status, visitedAt } = getPlaceAny(place);
  const isVisited = status === "visited";
  const Icon = getCategoryIcon(place.category);

  return (
    <div
      className={`group flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        isSelected
          ? "border-white/20 bg-white/[0.08]"
          : "border-white/[0.07] bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.06]"
      }`}
      onClick={onSelect}
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/[0.07]">
        <Icon className="size-3.5 text-white/45" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white/80">{place.name}</span>
        {(country || place.category) && (
          <span className="block truncate text-[11px] text-white/35">
            {[country, place.category?.replace(/_/g, " ")].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
      {place.rating && (
        <div className="hidden shrink-0 sm:block">
          <RatingStars rating={place.rating} />
        </div>
      )}
      {!isVisited && (
        <span className="hidden shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/30 sm:block">
          want to go
        </span>
      )}
      {isVisited && !!visitedAt && (
        <span className="hidden shrink-0 text-[10px] tabular-nums text-white/30 sm:block">
          {formatVisitedDate(visitedAt)}
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function Travel() {
  const [selectedPlace, setSelectedPlace] = useState<PlaceSchema | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlaceSchema | null>(null);
  const [longPressPlace, setLongPressPlace] = useState<PlaceSchema | null>(null);
  const [longPressOpen, setLongPressOpen] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const queryClient = useQueryClient();

  const { data: placesData, isLoading } = useQuery({
    ...listPlacesV1PlacesGetOptions({
      client,
      query: { limit: PAGE_SIZE, page, sorting: ["-created_at" as const] },
    }),
    placeholderData: keepPreviousData,
  });

  const { data: timelineData } = useQuery({
    ...listPlacesV1PlacesGetOptions({
      client,
      query: {
        page: 1,
        limit: 10,
        sorting: ["-visited_at" as "-created_at"],
        status: "visited" as "want_to_go" | "visited",
      },
    }),
  });
  const timelinePlaces = timelineData?.items ?? [];

  const queryKey = listPlacesV1PlacesGetQueryKey({ client });

  const deleteMutation = useMutation({
    ...deletePlaceV1PlacesPlaceIdDeleteMutation({ client }),
    onMutate: async ({ path }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.filter((p: any) => p.id !== path.place_id) };
      });
      if (selectedPlace && deleteTarget && selectedPlace.id === deleteTarget.id) {
        setSelectedPlace(null);
      }
      setDeleteTarget(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) queryClient.setQueryData(key, data);
      }
      toast.error("Failed to delete place");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const markVisitedMutation = useMutation({
    ...updatePlaceV1PlacesPlaceIdPatchMutation({ client }),
    onMutate: async ({ path, body }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((p: any) => (p.id === path.place_id ? { ...p, ...body } : p)),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) queryClient.setQueryData(key, data);
      }
      toast.error("Failed to update place");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const handleQuickMarkVisited = (place: PlaceSchema) => {
    markVisitedMutation.mutate({
      client,
      path: { place_id: place.id },
      body: { status: "visited", visited_at: new Date() },
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ client, path: { place_id: deleteTarget.id } });
  };

  const handleSelectPlace = (place: PlaceSchema) => {
    setSelectedPlace((prev) => (prev?.id === place.id ? null : place));
  };

  const places = placesData?.items ?? [];
  const totalCount = placesData?.pagination.total_count ?? 0;
  const maxPage = placesData?.pagination.max_page ?? 1;
  const sel = selectedPlace ? getPlaceAny(selectedPlace) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/80">Travel</span>
          {totalCount > 0 && (
            <span className="tabular-nums text-xs text-white/30">{totalCount}</span>
          )}
        </div>
        <AddPlaceDialog />
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-xs text-white/25">
          Loading…
        </div>
      ) : places.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <MapPin className="size-8 text-white/10" />
          <p className="text-xs text-white/25">No places yet</p>
          <div className="mt-1">
            <AddPlaceDialog />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Left: map + list */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Timeline + map */}
            <div className="hidden gap-3 px-3 pt-3 md:flex" style={{ height: "280px" }}>
              <div className="w-[200px] shrink-0 overflow-hidden rounded-xl border border-white/[0.08]">
                <TravelTimeline places={timelinePlaces} onSelectPlace={handleSelectPlace} />
              </div>
              <div className="flex-1 overflow-hidden rounded-xl border border-white/[0.08]">
                <Suspense fallback={null}>
                  <PlaceMap
                    places={places}
                    onSelectPlace={handleSelectPlace}
                    selectedPlaceId={selectedPlace?.id ?? null}
                  />
                </Suspense>
              </div>
            </div>

            {/* Card list */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-1.5">
                {places.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    isSelected={selectedPlace?.id === place.id}
                    onSelect={() => handleSelectPlace(place)}
                    onDelete={() => setDeleteTarget(place)}
                  />
                ))}
              </div>
              {maxPage > 1 && (
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-white/40 transition-colors hover:border-white/20 hover:text-white/70 disabled:pointer-events-none disabled:opacity-30"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-[11px] tabular-nums text-white/30">
                    {page} / {maxPage}
                  </span>
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-white/40 transition-colors hover:border-white/20 hover:text-white/70 disabled:pointer-events-none disabled:opacity-30"
                    onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                    disabled={page >= maxPage}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: detail panel */}
          {selectedPlace && sel && (
            <div className="hidden w-[280px] shrink-0 flex-col overflow-y-auto border-l border-white/[0.08] md:flex">
              {/* Icon header */}
              {(() => {
                const Icon = getCategoryIcon(selectedPlace.category);
                return (
                  <div className="flex h-20 w-full shrink-0 items-center justify-center border-b border-white/[0.06] bg-white/[0.03]">
                    <Icon className="size-7 text-white/25" />
                  </div>
                );
              })()}

              <div className="space-y-3 p-4">
                {/* Title + close */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight text-white/85">
                      {selectedPlace.name}
                    </h3>
                    {(sel.country || selectedPlace.category) && (
                      <p className="mt-0.5 text-[11px] text-white/40">
                        {[sel.country, selectedPlace.category?.replace(/_/g, " ")]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPlace(null)}
                    className="mt-0.5 shrink-0 text-white/30 transition-colors hover:text-white/70"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Status + rating */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      sel.status === "visited"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-white/[0.07] text-white/40"
                    }`}
                  >
                    {sel.status === "visited" ? "Visited" : "Want to go"}
                  </span>
                  {!!sel.visitedAt && (
                    <span className="text-[11px] text-white/35">
                      {formatVisitedDate(sel.visitedAt)}
                    </span>
                  )}
                  {selectedPlace.rating && (
                    <div className="ml-auto">
                      <RatingStars rating={selectedPlace.rating} />
                    </div>
                  )}
                </div>

                {/* Tags */}
                {(() => {
                  const tags = getPlaceAny(selectedPlace).tags;
                  return tags.length > 0 ? <TagDisplay tags={tags} /> : null;
                })()}

                {/* Address + maps link */}
                <div className="space-y-1.5">
                  {selectedPlace.address && (
                    <div className="flex items-start gap-2 text-white/40">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      <span className="text-[11px] leading-relaxed">{selectedPlace.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-white/40">
                    <Map className="size-3.5 shrink-0" />
                    <a
                      href={getGoogleMapsUrl(selectedPlace)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary-400 transition-colors hover:text-primary-300"
                    >
                      View on Google Maps
                    </a>
                  </div>
                </div>

                {/* Review */}
                {selectedPlace.review && (
                  <div className="border-t border-white/[0.06] pt-3">
                    <p className="text-[11px] leading-relaxed whitespace-pre-wrap text-white/40">
                      {selectedPlace.review}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1.5 border-t border-white/[0.06] pt-3">
                  <EditPlaceDialog place={selectedPlace} />
                  {sel.status !== "visited" && (
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-white/45 transition-colors hover:border-emerald-500/30 hover:text-emerald-400 disabled:pointer-events-none disabled:opacity-40"
                      onClick={() => handleQuickMarkVisited(selectedPlace)}
                      disabled={markVisitedMutation.isPending}
                    >
                      <Check className="size-3" />
                      Mark visited
                    </button>
                  )}
                  <button
                    type="button"
                    className="ml-auto rounded p-1 text-white/25 transition-colors hover:text-red-400"
                    onClick={() => setDeleteTarget(selectedPlace)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile long-press sheet */}
      {longPressOpen && longPressPlace && (
        <>
          <div
            className="fixed inset-0 z-50 animate-in fade-in-0 duration-150 bg-black/50"
            onClick={() => {
              setLongPressOpen(false);
              setLongPressPlace(null);
            }}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-200">
            <div className="rounded-t-2xl border-t border-white/10 bg-black/70 p-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
              <div className="truncate px-3 py-2 text-sm font-medium text-white/50">
                {longPressPlace.name}
              </div>
              <a
                href={getGoogleMapsUrl(longPressPlace)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-white/70 transition-colors hover:bg-white/[0.07]"
                onClick={() => {
                  setLongPressOpen(false);
                  setLongPressPlace(null);
                }}
              >
                <Map className="size-4 text-white/40" />
                <span className="text-sm">Open in Maps</span>
              </a>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-white/70 transition-colors hover:bg-white/[0.07]"
                onClick={() => {
                  setLongPressOpen(false);
                  setLongPressPlace(null);
                  handleSelectPlace(longPressPlace);
                }}
              >
                <Pencil className="size-4 text-white/40" />
                <span className="text-sm">Edit</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-red-400 transition-colors hover:bg-white/[0.07]"
                onClick={() => {
                  setLongPressOpen(false);
                  setDeleteTarget(longPressPlace);
                  setLongPressPlace(null);
                }}
              >
                <Trash2 className="size-4" />
                <span className="text-sm">Delete</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete place?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be permanently removed. This can&rsquo;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

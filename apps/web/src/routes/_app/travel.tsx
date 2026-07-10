import type { PlaceSchema } from "@metron/client";
import {
  deletePlaceV1PlacesPlaceIdDeleteMutation,
  listPlacesV1PlacesGetOptions,
  listPlacesV1PlacesGetQueryKey,
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
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Map,
  MapPin,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { AddPlaceDialog } from "@/components/add-place-dialog";
import { EditPlaceDialog } from "@/components/edit-place-dialog";

const PlaceMap = lazy(() =>
  import("@/components/place-map").then((m) => ({ default: m.PlaceMap })),
);

import { toast } from "sonner";
import { TagDisplay } from "@/components/tag-input";
import { client } from "@/lib/client";
import { PlaceCard } from "./-place-card";
import { RatingStars } from "./-rating-stars";
import { TravelTimeline } from "./-travel-timeline";
import {
  formatVisitedDate,
  getCategoryIcon,
  getGoogleMapsUrl,
  getPlaceAny,
} from "./-travel-utils";

export const Route = createFileRoute("/_app/travel")({
  component: Travel,
});

function Travel() {
  const [selectedPlace, setSelectedPlace] = useState<PlaceSchema | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlaceSchema | null>(null);
  const [longPressPlace, setLongPressPlace] = useState<PlaceSchema | null>(
    null,
  );
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
        return {
          ...old,
          items: old.items.filter((p: any) => p.id !== path.place_id),
        };
      });
      if (
        selectedPlace &&
        deleteTarget &&
        selectedPlace.id === deleteTarget.id
      ) {
        setSelectedPlace(null);
      }
      setDeleteTarget(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous)
          queryClient.setQueryData(key, data);
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
          items: old.items.map((p: any) =>
            p.id === path.place_id ? { ...p, ...body } : p,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous)
          queryClient.setQueryData(key, data);
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
            <span className="tabular-nums text-xs text-white/30">
              {totalCount}
            </span>
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
            <div
              className="hidden gap-3 px-3 pt-3 md:flex"
              style={{ height: "280px" }}
            >
              <div className="w-[200px] shrink-0 overflow-hidden rounded-xl border border-white/[0.08]">
                <TravelTimeline
                  places={timelinePlaces}
                  onSelectPlace={handleSelectPlace}
                />
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
                        {[
                          sel.country,
                          selectedPlace.category?.replace(/_/g, " "),
                        ]
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
                      <span className="text-[11px] leading-relaxed">
                        {selectedPlace.address}
                      </span>
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
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete place?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be permanently removed.
              This can&rsquo;t be undone.
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

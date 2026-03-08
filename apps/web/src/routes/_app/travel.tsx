import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Star,
  MapPin,
  X,
  Map,
  Check,
  Plane,
} from "lucide-react";
import type { PlaceSchema } from "@metron/client";
import {
  listPlacesV1PlacesGetOptions,
  listPlacesV1PlacesGetQueryKey,
  deletePlaceV1PlacesPlaceIdDeleteMutation,
  updatePlaceV1PlacesPlaceIdPatchMutation,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";


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
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@metron/ui/components/empty";
import { DataTable } from "@/components/data-table";
import { AddPlaceDialog } from "@/components/add-place-dialog";
import { EditPlaceDialog } from "@/components/edit-place-dialog";
import { PlaceMap } from "@/components/place-map";
import { TagDisplay } from "@/components/tag-input";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/travel")({
  component: Travel,
});


function formatVisitedDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return format(value, "MMM d, yyyy");
  return format(new Date(String(value)), "MMM d, yyyy");
}

function getGoogleMapsUrl(place: PlaceSchema): string {
  const placeAny = place as Record<string, unknown>;
  if (placeAny.google_place_id) {
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
          className={`${s} ${i < rating ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/20"}`}
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
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <Plane className="size-8 text-muted-foreground/20 mb-2" />
        <p className="text-xs text-muted-foreground">No visited places yet</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Plane className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Recent Visits
        </span>
      </div>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-0.5">
          {places.map((place, i) => {
            const a = place as Record<string, unknown>;
            const visitedAt = a.visited_at;
            const country = a.country as string | undefined;
            const isFirst = i === 0;

            let timeLabel = "";
            if (visitedAt) {
              try {
                const d = visitedAt instanceof Date ? visitedAt : new Date(String(visitedAt));
                timeLabel = formatDistanceToNow(d, { addSuffix: true });
              } catch {
                timeLabel = "";
              }
            }

            return (
              <button
                key={place.id}
                type="button"
                className="relative flex items-start gap-3 w-full rounded-md px-1 py-2 text-left transition-colors hover:bg-accent/50 group"
                onClick={() => onSelectPlace(place)}
              >
                {/* Dot */}
                <div className="relative z-10 mt-1 shrink-0">
                  <div
                    className={`size-[9px] rounded-full ring-2 ring-background ${
                      isFirst ? "bg-green-500" : "bg-muted-foreground/30"
                    }`}
                  />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 -mt-0.5">
                  <div className="text-sm font-medium leading-snug truncate group-hover:text-foreground">
                    {place.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {country && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {country}
                      </span>
                    )}
                    {country && place.category && (
                      <span className="text-muted-foreground/30 text-[11px]">/</span>
                    )}
                    {place.category && (
                      <span className="text-[11px] text-muted-foreground/60 capitalize truncate">
                        {place.category.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  {timeLabel && (
                    <span className="text-[10px] text-muted-foreground/50 mt-0.5 block">
                      {timeLabel}
                    </span>
                  )}
                </div>

                {/* Rating */}
                {place.rating && (
                  <div className="shrink-0 mt-0.5">
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


function Travel() {
  const [page, setPage] = useState(1);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSchema | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlaceSchema | null>(null);
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...listPlacesV1PlacesGetOptions({
      client,
      query: {
        page,
        limit,
        sorting: ["-created_at" as "-created_at"],
      },
    }),
    placeholderData: keepPreviousData,
  });

  // Timeline: recently visited places
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

  const deleteMutation = useMutation({
    ...deletePlaceV1PlacesPlaceIdDeleteMutation({ client }),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: listPlacesV1PlacesGetQueryKey({ client }),
      });
      setDeleteTarget(null);
      if (selectedPlace && deleteTarget && selectedPlace.id === deleteTarget.id) {
        setSelectedPlace(null);
      }
    },
  });

  const markVisitedMutation = useMutation({
    ...updatePlaceV1PlacesPlaceIdPatchMutation({ client }),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: listPlacesV1PlacesGetQueryKey({ client }),
      });
    },
  });

  const handleQuickMarkVisited = (place: PlaceSchema) => {
    markVisitedMutation.mutate({
      client,
      path: { place_id: place.id },
      body: {
        status: "visited",
        visited_at: new Date(),
      },
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({
      client,
      path: { place_id: deleteTarget.id },
    });
  };

  const handleSelectPlace = (place: PlaceSchema) => {
    // Toggle: clicking the same place deselects it
    setSelectedPlace((prev) => (prev?.id === place.id ? null : place));
  };


  const columns: ColumnDef<PlaceSchema>[] = [
    {
      accessorKey: "name",
      header: "Place",
      cell: ({ row }) => {
        const place = row.original;
        const { country, status } = getPlaceAny(place);
        const isVisited = status === "visited";

        return (
          <button
            type="button"
            className="text-left w-full py-0.5"
            onClick={() => handleSelectPlace(place)}
          >
            <div className="flex items-center gap-3">
              <div
                className={`size-2 rounded-full shrink-0 ${
                  isVisited ? "bg-green-500" : "bg-amber-500"
                }`}
                title={isVisited ? "Visited" : "Want to go"}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium hover:underline truncate">
                  {place.name}
                </div>
                {(country || place.category) && (
                  <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground text-xs">
                    {country && <span>{country}</span>}
                    {country && place.category && <span className="opacity-40">/</span>}
                    {place.category && (
                      <span className="capitalize">{place.category.replace(/_/g, " ")}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      },
    },
    {
      id: "labels",
      header: "Labels",
      size: 180,
      cell: ({ row }) => {
        const { tags } = getPlaceAny(row.original);
        if (tags.length === 0) return null;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <TagDisplay key={tag} tags={[tag]} />
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "rating",
      header: "Rating",
      size: 100,
      cell: ({ row }) => {
        const rating = row.original.rating;
        if (!rating) return <span className="text-muted-foreground/30 text-xs">\u2014</span>;
        return <RatingStars rating={rating} />;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 140,
      cell: ({ row }) => {
        const { status, visitedAt } = getPlaceAny(row.original);
        const isVisited = status === "visited";
        return (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  isVisited
                    ? "bg-green-500/10 text-green-500"
                    : "bg-amber-500/10 text-amber-500"
                }`}
              >
                {isVisited ? "Visited" : "Want to go"}
              </span>
              {!isVisited && (
                <button
                  type="button"
                  title="Mark as visited"
                  className="text-muted-foreground/50 hover:text-green-500 transition-colors"
                  onClick={() => handleQuickMarkVisited(row.original)}
                >
                  <Check className="size-3.5" />
                </button>
              )}
            </div>
            {isVisited && visitedAt ? (
              <span className="text-muted-foreground text-[11px] leading-none">
                {formatVisitedDate(visitedAt)}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      size: 110,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5">
          <a
            href={getGoogleMapsUrl(row.original)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Maps"
            className="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Map className="size-3.5" />
          </a>
          <EditPlaceDialog place={row.original} />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const places = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;
  const totalCount = data?.pagination.total_count ?? 0;
  const sel = selectedPlace ? getPlaceAny(selectedPlace) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Travel</h2>
          {totalCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {totalCount} place{totalCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <AddPlaceDialog />
      </div>

      {/* Main content */}
      {isLoading ? (
        <div className="text-muted-foreground flex h-32 items-center justify-center">
          Loading...
        </div>
      ) : places.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapPin />
            </EmptyMedia>
            <EmptyTitle>No places yet</EmptyTitle>
            <EmptyDescription>
              Start building your travel database by adding places you've visited or want to visit.
            </EmptyDescription>
          </EmptyHeader>
          <AddPlaceDialog />
        </Empty>
      ) : (
        <div className="flex gap-4 items-start">
          {/* Left: map + table + pagination */}
          <div className="flex-1 min-w-0 space-y-4">
            {places.length > 0 && (
              <div className="flex gap-4 h-[360px]">
                {/* Timeline */}
                <div className="w-[260px] shrink-0 rounded-lg border bg-card overflow-hidden">
                  <TravelTimeline
                    places={timelinePlaces}
                    onSelectPlace={handleSelectPlace}
                  />
                </div>
                {/* Map */}
                <div className="flex-1 rounded-lg border overflow-hidden">
                  <PlaceMap
                    places={places}
                    onSelectPlace={handleSelectPlace}
                    selectedPlaceId={selectedPlace?.id ?? null}
                  />
                </div>
              </div>
            )}

            <div className={isPlaceholderData ? "opacity-50 transition-opacity" : "transition-opacity"}>
              <DataTable
                columns={columns}
                data={places}
                getRowId={(row) => row.id}
                activeRowId={selectedPlace?.id}
                emptyMessage="No places yet."
              />
            </div>

            {maxPage > 1 && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isPlaceholderData}
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {page} / {maxPage}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                  disabled={page >= maxPage || isPlaceholderData}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Right: detail sidebar */}
          {selectedPlace && sel && (
            <div className="w-[300px] shrink-0 rounded-lg border bg-card sticky top-4">
              {/* Photo */}
              {selectedPlace.photo_url && (
                <img
                  src={selectedPlace.photo_url}
                  alt={selectedPlace.name}
                  className="w-full h-36 object-cover rounded-t-lg"
                />
              )}

              <div className="p-4 space-y-3">
                {/* Title + close */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight">{selectedPlace.name}</h3>
                    {(sel.country || selectedPlace.category) && (
                      <p className="text-muted-foreground text-xs mt-0.5">
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
                    className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Status + rating */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      sel.status === "visited"
                        ? "bg-green-500/10 text-green-500"
                        : "bg-amber-500/10 text-amber-500"
                    }`}
                  >
                    {sel.status === "visited" ? "Visited" : "Want to go"}
                  </span>
                  {sel.visitedAt ? (
                    <span className="text-muted-foreground text-xs">
                      {formatVisitedDate(sel.visitedAt)}
                    </span>
                  ) : null}
                  {selectedPlace.rating && (
                    <div className="ml-auto">
                      <RatingStars rating={selectedPlace.rating} />
                    </div>
                  )}
                </div>

                {/* Tags */}
                {(() => {
                  const tags = Array.isArray((selectedPlace as Record<string, unknown>).tags)
                    ? ((selectedPlace as Record<string, unknown>).tags as string[])
                    : [];
                  return tags.length > 0 ? <TagDisplay tags={tags} /> : null;
                })()}

                {/* Info rows */}
                <div className="space-y-1.5 text-sm">
                  {selectedPlace.address && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="size-3.5 mt-0.5 shrink-0" />
                      <span className="text-foreground text-xs leading-relaxed">{selectedPlace.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Map className="size-3.5 shrink-0" />
                    <a
                      href={getGoogleMapsUrl(selectedPlace)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-xs"
                    >
                      View on Google Maps
                    </a>
                  </div>
                </div>

                {/* Review */}
                {selectedPlace.review && (
                  <div className="pt-2 border-t">
                    <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {selectedPlace.review}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 border-t flex items-center gap-1.5">
                  <EditPlaceDialog place={selectedPlace} />
                  {sel.status !== "visited" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => handleQuickMarkVisited(selectedPlace)}
                      disabled={markVisitedMutation.isPending}
                    >
                      <Check className="size-3 mr-1" />
                      Mark visited
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive ml-auto"
                    onClick={() => setDeleteTarget(selectedPlace)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete place?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be permanently removed. This can&rsquo;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

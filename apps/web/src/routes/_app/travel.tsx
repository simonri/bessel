import { lazy, Suspense, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
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
import { useIsMobile } from "@metron/ui/hooks/use-mobile";
import { VirtualDataTable } from "@/components/virtual-data-table";
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
        <span className="text-xs font-medium text-muted-foreground">
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
                      <span className="text-[11px] text-muted-foreground truncate">{country}</span>
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

export function Travel() {
  const isMobile = useIsMobile();
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
      if (selectedPlace && deleteTarget && selectedPlace.id === deleteTarget.id) {
        setSelectedPlace(null);
      }
      setDeleteTarget(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Failed to delete place");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
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
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Failed to update place");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
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
      header: "Place Name",
      cell: ({ row }) => {
        const place = row.original;
        const { country } = getPlaceAny(place);

        return (
          <button
            type="button"
            className="text-left w-full py-0.5"
            onClick={() => handleSelectPlace(place)}
          >
            <div className="flex items-center gap-3">
              {(() => {
                const Icon = getCategoryIcon(place.category);
                return (
                  <div className="size-8 rounded shrink-0 flex items-center justify-center bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </div>
                );
              })()}
              <div className="min-w-0 flex-1">
                <div className="font-medium hover:underline truncate">{place.name}</div>
                {country && <div className="text-muted-foreground text-xs mt-0.5">{country}</div>}
              </div>
            </div>
          </button>
        );
      },
    },
    {
      accessorKey: "category",
      header: "Category",
      size: 150,
      cell: ({ row }) => {
        const category = row.original.category;
        if (!category) return <span className="text-muted-foreground/30 text-xs">\u2014</span>;
        const label = category.replace(/_/g, " ");
        return (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            {label.charAt(0).toUpperCase() + label.slice(1)}
          </span>
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
      accessorKey: "visited_at",
      header: "Date Visited",
      size: 140,
      cell: ({ row }) => {
        const { status, visitedAt } = getPlaceAny(row.original);
        const isVisited = status === "visited";
        if (isVisited && visitedAt) {
          return <span className="text-sm">{formatVisitedDate(visitedAt)}</span>;
        }
        if (!isVisited) {
          return (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">Want to go</span>
              <button
                type="button"
                title="Mark as visited"
                className="text-muted-foreground/50 hover:text-green-500 transition-colors"
                onClick={() => handleQuickMarkVisited(row.original)}
              >
                <Check className="size-3.5" />
              </button>
            </div>
          );
        }
        return <span className="text-muted-foreground/30 text-xs">\u2014</span>;
      },
    },
    {
      id: "actions",
      header: "",
      size: 110,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5">
          <Button variant="ghost" size="icon" asChild title="Open in Google Maps">
            <a
              href={getGoogleMapsUrl(row.original)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Map className="size-3.5" />
            </a>
          </Button>
          <EditPlaceDialog place={row.original} />
          <Button
            variant="ghost"
            size="icon"
            title="Delete"
            className="hover:text-destructive"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const places = placesData?.items ?? [];
  const totalCount = placesData?.pagination.total_count ?? 0;
  const maxPage = placesData?.pagination.max_page ?? 1;
  const sel = selectedPlace ? getPlaceAny(selectedPlace) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
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
            <EmptyMedia >
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
        <div className="flex gap-4 min-h-0 flex-1">
          {/* Left: map + table */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-4">
            {places.length > 0 && (
              <div className="hidden md:flex gap-4 h-[360px] shrink-0">
                {/* Timeline */}
                <div className="w-[260px] shrink-0 rounded-lg border bg-card overflow-hidden">
                  <TravelTimeline places={timelinePlaces} onSelectPlace={handleSelectPlace} />
                </div>
                {/* Map */}
                <div className="flex-1 rounded-lg border overflow-hidden">
                  <Suspense fallback={null}>
                    <PlaceMap
                      places={places}
                      onSelectPlace={handleSelectPlace}
                      selectedPlaceId={selectedPlace?.id ?? null}
                    />
                  </Suspense>
                </div>
              </div>
            )}

            <VirtualDataTable
              columns={
                isMobile
                  ? columns.filter((c) => {
                      const key = "accessorKey" in c ? c.accessorKey : c.id;
                      return key !== "visited_at" && key !== "actions";
                    })
                  : columns
              }
              data={places}
              getRowId={(row) => row.id}
              emptyMessage="No places yet."
              onRowLongPress={
                isMobile
                  ? (place) => {
                      setLongPressPlace(place);
                      setLongPressOpen(true);
                    }
                  : undefined
              }
            />
            {maxPage > 1 && (
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
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
                  disabled={page >= maxPage}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Right: detail sidebar */}
          {selectedPlace && sel && (
            <div className="hidden md:block w-[300px] shrink-0 rounded-lg border bg-card overflow-y-auto">
              {/* Category icon header */}
              {(() => {
                const Icon = getCategoryIcon(selectedPlace.category);
                return (
                  <div className="w-full h-24 bg-muted flex items-center justify-center rounded-t-lg">
                    <Icon className="size-8 text-muted-foreground" />
                  </div>
                );
              })()}

              <div className="p-4 space-y-3">
                {/* Title + close */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight">{selectedPlace.name}</h3>
                    {(sel.country || selectedPlace.category) && (
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {[sel.country, selectedPlace.category?.replace(/_/g, " ")]
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
                  <span className="text-xs text-muted-foreground">
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
                      <span className="text-foreground text-xs leading-relaxed">
                        {selectedPlace.address}
                      </span>
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
                      className="text-xs"
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
                    className="hover:text-destructive ml-auto"
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

      {/* Mobile long-press actions */}
      {longPressOpen && longPressPlace && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 animate-in fade-in-0 duration-150"
            onClick={() => {
              setLongPressOpen(false);
              setLongPressPlace(null);
            }}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-200">
            <div className="bg-background rounded-t-2xl border-t p-2 pb-[env(safe-area-inset-bottom)]">
              <div className="text-sm font-medium text-muted-foreground px-3 py-2 truncate">
                {longPressPlace.name}
              </div>
              <a
                href={getGoogleMapsUrl(longPressPlace)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent transition-colors"
                onClick={() => {
                  setLongPressOpen(false);
                  setLongPressPlace(null);
                }}
              >
                <Map className="size-4 text-muted-foreground" />
                <span className="text-sm">Open in Maps</span>
              </a>
              <button
                type="button"
                className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent transition-colors w-full text-left"
                onClick={() => {
                  setLongPressOpen(false);
                  setLongPressPlace(null);
                  handleSelectPlace(longPressPlace);
                }}
              >
                <Pencil className="size-4 text-muted-foreground" />
                <span className="text-sm">Edit</span>
              </button>
              <button
                type="button"
                className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent transition-colors w-full text-left text-destructive"
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
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

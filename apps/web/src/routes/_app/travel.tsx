import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Star,
  Eye,
  EyeOff,
  MapPin,
  X,
  ExternalLink,
  ArrowUpDown,
  Map,
  Check,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metron/ui/components/dropdown-menu";
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

const STATUS_TABS = [
  { label: "All", value: undefined },
  { label: "Want to go", value: "want_to_go" as const },
  { label: "Visited", value: "visited" as const },
] as const;

const SORT_OPTIONS = [
  { label: "Recently added", value: "-created_at" },
  { label: "Name A\u2013Z", value: "name" },
  { label: "Name Z\u2013A", value: "-name" },
  { label: "Highest rated", value: "-rating" },
  { label: "Recently visited", value: "-visited_at" },
] as const;

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

const FILTER_EMPTY_MESSAGES: Record<string, string> = {
  want_to_go: "No places on your wishlist yet.",
  visited: "No visited places yet.",
};

function Travel() {
  const [page, setPage] = useState(1);
  const [showMap, setShowMap] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSchema | null>(null);
  const [sorting, setSorting] = useState("-created_at");
  const [deleteTarget, setDeleteTarget] = useState<PlaceSchema | null>(null);
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...listPlacesV1PlacesGetOptions({
      client,
      query: {
        page,
        limit,
        sorting: [sorting as "-created_at"],
        ...(statusFilter ? { status: statusFilter as "want_to_go" | "visited" } : {}),
      },
    }),
    placeholderData: keepPreviousData,
  });

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

  const handleChangeFilter = (value: string | undefined) => {
    setStatusFilter(value);
    setSelectedPlace(null);
    setPage(1);
  };

  const handleChangeSort = (value: string) => {
    setSorting(value);
    setPage(1);
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
  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sorting)?.label ?? "Sort";
  const sel = selectedPlace ? getPlaceAny(selectedPlace) : null;

  const emptyMessage = statusFilter
    ? FILTER_EMPTY_MESSAGES[statusFilter] ?? "No results."
    : "No results.";

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMap((v) => !v)}
          >
            {showMap ? <EyeOff className="size-4 mr-1.5" /> : <Eye className="size-4 mr-1.5" />}
            {showMap ? "Hide Map" : "Show Map"}
          </Button>
          <AddPlaceDialog />
        </div>
      </div>

      {/* Tabs + sort */}
      <div className="flex items-center justify-between border-b">
        <div className="flex">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                statusFilter === tab.value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => handleChangeFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground -mb-px">
              <ArrowUpDown className="size-3" />
              <span className="text-xs">{currentSortLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => handleChangeSort(option.value)}
                className={sorting === option.value ? "font-medium" : ""}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main content: map + table on left, detail panel on right */}
      {isLoading ? (
        <div className="text-muted-foreground flex h-32 items-center justify-center">
          Loading...
        </div>
      ) : places.length === 0 && !statusFilter ? (
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
            {showMap && places.length > 0 && (
              <div className="h-[360px] rounded-lg border overflow-hidden">
                <PlaceMap
                  places={places}
                  onSelectPlace={handleSelectPlace}
                  selectedPlaceId={selectedPlace?.id ?? null}
                />
              </div>
            )}

            <div className={isPlaceholderData ? "opacity-50 transition-opacity" : "transition-opacity"}>
              <DataTable
                columns={columns}
                data={places}
                getRowId={(row) => row.id}
                activeRowId={selectedPlace?.id}
                emptyMessage={emptyMessage}
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

          {/* Right: detail panel */}
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
                          .join(" \u00b7 ")}
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

                {/* Status + rating row */}
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
                  {selectedPlace.website && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ExternalLink className="size-3.5 shrink-0" />
                      <a
                        href={selectedPlace.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs truncate"
                      >
                        {selectedPlace.website.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
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

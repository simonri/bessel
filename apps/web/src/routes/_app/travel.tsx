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
  Globe,
  ExternalLink,
  ArrowUpDown,
  Map,
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
  { label: "Name A-Z", value: "name" },
  { label: "Name Z-A", value: "-name" },
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

  const columns: ColumnDef<PlaceSchema>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <button
          type="button"
          className="text-left"
          onClick={() => setSelectedPlace(row.original)}
        >
          <div className="font-medium hover:underline">{row.original.name}</div>
          {row.original.address && (
            <div className="text-muted-foreground text-xs truncate max-w-[300px]">
              {row.original.address}
            </div>
          )}
        </button>
      ),
    },
    {
      accessorKey: "country",
      header: "Country",
      size: 100,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {(row.original as Record<string, unknown>).country as string ?? "-"}
        </span>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      size: 120,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm capitalize">
          {row.original.category?.replace(/_/g, " ") ?? "-"}
        </span>
      ),
    },
    {
      accessorKey: "rating",
      header: "Rating",
      size: 100,
      cell: ({ row }) => {
        const rating = row.original.rating;
        if (!rating) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`size-3.5 ${i < rating ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/30"}`}
              />
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 130,
      cell: ({ row }) => {
        const status = (row.original as Record<string, unknown>).status as string;
        const visitedAt = (row.original as Record<string, unknown>).visited_at;
        const isVisited = status === "visited";
        return (
          <div className="flex flex-col gap-0.5">
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
                  className="text-muted-foreground hover:text-green-500 transition-colors"
                  onClick={() => handleQuickMarkVisited(row.original)}
                >
                  <MapPin className="size-3.5" />
                </button>
              )}
            </div>
            {isVisited && visitedAt ? (
              <span className="text-muted-foreground text-xs">
                {formatVisitedDate(visitedAt)}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "actions",
      size: 100,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <EditPlaceDialog place={row.original} />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  const places = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;
  const totalCount = data?.pagination.total_count ?? 0;
  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sorting)?.label ?? "Sort";

  return (
    <div className="space-y-6">
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
            {showMap ? <EyeOff className="size-4 mr-1" /> : <Eye className="size-4 mr-1" />}
            {showMap ? "Hide Map" : "Show Map"}
          </Button>
          <AddPlaceDialog />
        </div>
      </div>

      {/* Status filter tabs + sort */}
      <div className="flex items-center justify-between border-b">
        <div className="flex gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                statusFilter === tab.value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground -mb-px">
              <ArrowUpDown className="size-3.5" />
              {currentSortLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => {
                  setSorting(option.value);
                  setPage(1);
                }}
                className={sorting === option.value ? "font-medium" : ""}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showMap && places.length > 0 && (
        <div className="flex gap-4">
          <div className={`h-[400px] rounded-lg border overflow-hidden ${selectedPlace ? "flex-1" : "w-full"}`}>
            <PlaceMap
              places={places}
              onSelectPlace={setSelectedPlace}
              selectedPlaceId={selectedPlace?.id ?? null}
            />
          </div>

          {/* Detail panel */}
          {selectedPlace && (
            <div className="w-[320px] shrink-0 rounded-lg border p-4 space-y-3 overflow-y-auto h-[400px]">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg leading-tight">{selectedPlace.name}</h3>
                  {selectedPlace.category && (
                    <p className="text-muted-foreground text-sm capitalize mt-0.5">
                      {selectedPlace.category.replace(/_/g, " ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPlace(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              {selectedPlace.photo_url && (
                <img
                  src={selectedPlace.photo_url}
                  alt={selectedPlace.name}
                  className="w-full h-32 object-cover rounded-md"
                />
              )}

              <div className="space-y-2 text-sm">
                {selectedPlace.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="text-muted-foreground size-4 mt-0.5 shrink-0" />
                    <span>{selectedPlace.address}</span>
                  </div>
                )}
                {(() => {
                  const country = (selectedPlace as Record<string, unknown>).country as string | undefined;
                  if (!country) return null;
                  return (
                    <div className="flex items-center gap-2">
                      <Globe className="text-muted-foreground size-4 shrink-0" />
                      <span>{country}</span>
                    </div>
                  );
                })()}
                {selectedPlace.website && (
                  <div className="flex items-center gap-2">
                    <ExternalLink className="text-muted-foreground size-4 shrink-0" />
                    <a href={selectedPlace.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                      {selectedPlace.website}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Map className="text-muted-foreground size-4 shrink-0" />
                  <a
                    href={getGoogleMapsUrl(selectedPlace)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-xs"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                {(() => {
                  const status = (selectedPlace as Record<string, unknown>).status as string;
                  const isVisited = status === "visited";
                  return (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      isVisited ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"
                    }`}>
                      {isVisited ? "Visited" : "Want to go"}
                    </span>
                  );
                })()}
                {(() => {
                  const visitedAt = (selectedPlace as Record<string, unknown>).visited_at;
                  if (!visitedAt) return null;
                  return (
                    <span className="text-muted-foreground text-xs">
                      {formatVisitedDate(visitedAt)}
                    </span>
                  );
                })()}
              </div>

              {selectedPlace.rating && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`size-4 ${i < selectedPlace.rating! ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/30"}`}
                    />
                  ))}
                </div>
              )}

              {selectedPlace.review && (
                <div className="pt-2 border-t">
                  <p className="text-sm whitespace-pre-wrap">{selectedPlace.review}</p>
                </div>
              )}

              <div className="pt-2 border-t flex gap-2">
                <EditPlaceDialog place={selectedPlace} />
                {(selectedPlace as Record<string, unknown>).status !== "visited" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQuickMarkVisited(selectedPlace)}
                    disabled={markVisitedMutation.isPending}
                  >
                    <MapPin className="size-3.5 mr-1" />
                    Mark visited
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive ml-auto"
                  onClick={() => setDeleteTarget(selectedPlace)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground flex h-24 items-center justify-center">
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
        <>
          <div className={isPlaceholderData ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <DataTable columns={columns} data={places} />
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
              <span className="text-muted-foreground text-sm">
                Page {page} of {maxPage}
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
        </>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete place?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be permanently removed. This can't be undone.
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

import type { PlaceSchema, PlaceStatus } from "@bessel/client";
import {
  deletePlaceV1PlacesPlaceIdDeleteMutation,
  listPlacesV1PlacesGetOptions,
  listPlacesV1PlacesGetQueryKey,
  updatePlaceV1PlacesPlaceIdPatchMutation,
} from "@bessel/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@bessel/ui/components/alert-dialog";
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
  Globe,
  Map,
  MapPin,
  Phone,
  Search,
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
import {
  formatVisitedDate,
  getCategoryIcon,
  getGoogleMapsUrl,
} from "./-travel-utils";

export const Route = createFileRoute("/_app/travel")({
  component: Travel,
});

type StatusTab = "all" | PlaceStatus;
type SortKey = "-created_at" | "-visited_at" | "-rating" | "name";

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "visited", label: "Visited" },
  { key: "want_to_go", label: "Want to go" },
];

function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Travel() {
  const [selectedPlace, setSelectedPlace] = useState<PlaceSchema | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlaceSchema | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [sort, setSort] = useState<SortKey>("-created_at");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const queryClient = useQueryClient();

  const { data: placesData, isLoading } = useQuery({
    ...listPlacesV1PlacesGetOptions({
      client,
      query: {
        limit: PAGE_SIZE,
        page,
        sorting: [sort],
        ...(statusTab !== "all" ? { status: statusTab } : {}),
      },
    }),
    placeholderData: keepPreviousData,
  });

  // Per-status totals for the tabs — limit=1 keeps the payloads negligible;
  // only pagination.total_count is read.
  const { data: visitedTotal } = useQuery({
    ...listPlacesV1PlacesGetOptions({
      client,
      query: { limit: 1, status: "visited" },
    }),
    select: (d) => d.pagination.total_count,
  });
  const { data: wantTotal } = useQuery({
    ...listPlacesV1PlacesGetOptions({
      client,
      query: { limit: 1, status: "want_to_go" },
    }),
    select: (d) => d.pagination.total_count,
  });
  const tabCounts: Record<StatusTab, number | undefined> = {
    all:
      visitedTotal != null && wantTotal != null
        ? visitedTotal + wantTotal
        : undefined,
    visited: visitedTotal,
    want_to_go: wantTotal,
  };

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

  // Search filters within the loaded page (there is no server-side text
  // search); at PAGE_SIZE=50 this covers the whole collection until it grows
  // well past that.
  const q = search.trim().toLowerCase();
  const filtered = q
    ? places.filter((p) =>
        [p.name, p.country, p.category, ...(p.tags ?? [])]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      )
    : places;

  const noPlacesAtAll = totalCount === 0 && statusTab === "all" && !q;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/80">Travel</span>
          {tabCounts.all != null && tabCounts.all > 0 && (
            <span className="tabular-nums text-xs text-white/50">
              {tabCounts.all}
            </span>
          )}
        </div>
        <AddPlaceDialog />
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-xs text-white/50">
          Loading…
        </div>
      ) : noPlacesAtAll ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <MapPin className="size-8 text-white/10" />
          <p className="text-xs text-white/50">No places yet</p>
          <div className="mt-1">
            <AddPlaceDialog />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Left: toolbar + map + list */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Toolbar */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-3">
              <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
                {STATUS_TABS.map((tab) => {
                  const active = statusTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setStatusTab(tab.key);
                        setPage(1);
                      }}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                        active
                          ? "bg-white/10 text-white/90"
                          : "text-white/50 hover:text-white/75"
                      }`}
                    >
                      {tab.label}
                      {tabCounts[tab.key] != null && (
                        <span
                          className={`text-10 tabular-nums ${active ? "text-white/50" : "text-white/30"}`}
                        >
                          {tabCounts[tab.key]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search places…"
                    className="h-7 w-44 rounded-lg border border-white/[0.08] bg-white/[0.04] pl-7 pr-2 text-xs text-white/80 outline-none transition-colors placeholder:text-white/30 focus:border-white/20"
                  />
                </div>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as SortKey);
                    setPage(1);
                  }}
                  className="h-7 cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white/65 outline-none transition-colors hover:text-white/80 focus:border-white/20"
                >
                  <option value="-created_at" className="bg-neutral-900">
                    Newest
                  </option>
                  <option value="-visited_at" className="bg-neutral-900">
                    Recently visited
                  </option>
                  <option value="-rating" className="bg-neutral-900">
                    Top rated
                  </option>
                  <option value="name" className="bg-neutral-900">
                    Name
                  </option>
                </select>
              </div>
            </div>

            {/* Map */}
            <div className="hidden h-[280px] shrink-0 px-3 pt-3 md:block">
              <div className="h-full overflow-hidden rounded-xl border border-white/[0.08]">
                <Suspense fallback={null}>
                  <PlaceMap
                    places={filtered}
                    onSelectPlace={handleSelectPlace}
                    selectedPlaceId={selectedPlace?.id ?? null}
                  />
                </Suspense>
              </div>
            </div>

            {/* Card list */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filtered.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-xs text-white/40">
                  {q ? "No places match your search" : "Nothing here yet"}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map((place) => (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      isSelected={selectedPlace?.id === place.id}
                      onSelect={() => handleSelectPlace(place)}
                      onDelete={() => setDeleteTarget(place)}
                    />
                  ))}
                </div>
              )}
              {maxPage > 1 && (
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-white/40 transition-colors hover:border-white/20 hover:text-white/70 disabled:pointer-events-none disabled:opacity-30"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-11 tabular-nums text-white/50">
                    {page} / {maxPage}
                  </span>
                  <button
                    type="button"
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
          {selectedPlace && (
            <div className="hidden w-[300px] shrink-0 flex-col overflow-y-auto border-l border-white/[0.08] md:flex">
              {selectedPlace.photo_url ? (
                <img
                  src={selectedPlace.photo_url}
                  alt=""
                  className="h-36 w-full shrink-0 border-b border-white/[0.06] object-cover"
                />
              ) : (
                (() => {
                  const Icon = getCategoryIcon(selectedPlace.category);
                  return (
                    <div className="flex h-20 w-full shrink-0 items-center justify-center border-b border-white/[0.06] bg-white/[0.03]">
                      <Icon className="size-7 text-white/25" />
                    </div>
                  );
                })()
              )}

              <div className="space-y-3 p-4">
                {/* Title + close */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight text-white/85">
                      {selectedPlace.name}
                    </h3>
                    {(selectedPlace.country || selectedPlace.category) && (
                      <p className="mt-0.5 text-11 text-white/50">
                        {[
                          selectedPlace.country,
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
                    className={`rounded-full px-2 py-0.5 text-10 font-medium ${
                      selectedPlace.status === "visited"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-amber-500/10 text-amber-400/90"
                    }`}
                  >
                    {selectedPlace.status === "visited"
                      ? "Visited"
                      : "Want to go"}
                  </span>
                  {!!selectedPlace.visited_at && (
                    <span className="text-11 text-white/50">
                      {formatVisitedDate(selectedPlace.visited_at)}
                    </span>
                  )}
                  {selectedPlace.rating && (
                    <div className="ml-auto">
                      <RatingStars rating={selectedPlace.rating} />
                    </div>
                  )}
                </div>

                {/* Tags */}
                {(selectedPlace.tags?.length ?? 0) > 0 && (
                  <TagDisplay tags={selectedPlace.tags!} />
                )}

                {/* Address, links, contact */}
                <div className="space-y-1.5">
                  {selectedPlace.address && (
                    <div className="flex items-start gap-2 text-white/50">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      <span className="text-11 leading-relaxed">
                        {selectedPlace.address}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-white/50">
                    <Map className="size-3.5 shrink-0" />
                    <a
                      href={getGoogleMapsUrl(selectedPlace)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-11 text-primary-400 transition-colors hover:text-primary-300"
                    >
                      View on Google Maps
                    </a>
                  </div>
                  {selectedPlace.website && (
                    <div className="flex items-center gap-2 text-white/50">
                      <Globe className="size-3.5 shrink-0" />
                      <a
                        href={selectedPlace.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-11 text-primary-400 transition-colors hover:text-primary-300"
                      >
                        {websiteLabel(selectedPlace.website)}
                      </a>
                    </div>
                  )}
                  {selectedPlace.phone && (
                    <div className="flex items-center gap-2 text-white/50">
                      <Phone className="size-3.5 shrink-0" />
                      <span className="text-11">{selectedPlace.phone}</span>
                    </div>
                  )}
                </div>

                {/* Review */}
                {selectedPlace.review && (
                  <div className="border-t border-white/[0.06] pt-3">
                    <p className="text-11 leading-relaxed whitespace-pre-wrap text-white/50">
                      {selectedPlace.review}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1.5 border-t border-white/[0.06] pt-3">
                  <EditPlaceDialog place={selectedPlace} />
                  {selectedPlace.status !== "visited" && (
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-md border border-white/[0.08] px-2 py-1 text-11 text-white/50 transition-colors hover:border-emerald-500/30 hover:text-emerald-400 disabled:pointer-events-none disabled:opacity-40"
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

import type { PlaceSchema, PlaceStatus } from "@bessel/client";
import {
  deletePlaceV1PlacesPlaceIdDeleteMutation,
  getPlaceV1PlacesPlaceIdGetOptions,
  listPlacesV1PlacesGetOptions,
  listPlacesV1PlacesGetQueryKey,
  updatePlaceV1PlacesPlaceIdPatchMutation,
} from "@bessel/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { Skeleton } from "@bessel/ui/components/skeleton";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  Globe,
  Map as MapIcon,
  MapPin,
  Phone,
  Search,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";

import { AddPlaceDialog } from "@/components/add-place-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { EditPlaceDialog } from "@/components/edit-place-dialog";

const PlaceMap = lazy(() =>
  import("@/components/place-map").then((m) => ({ default: m.PlaceMap })),
);

import { toast } from "sonner";
import { TagDisplay } from "@/components/tag-input";
import {
  EmptyState,
  IconButton,
  Panel,
  PeriodNav,
  SoftButton,
  TextInput,
} from "@/components/ui-kit";
import { client } from "@/lib/client";
import {
  mutationFamily,
  restoreItemFields,
  settleWhenIdle,
} from "@/lib/optimistic";
import { clearPageTarget, usePageTarget } from "@/lib/page-target";
import { cn } from "@/lib/utils";
import { PlaceCard, StatusBadge } from "./-place-card";
import { RatingStars } from "./-rating-stars";
import {
  formatVisitedDate,
  getCategoryIcon,
  getGoogleMapsUrl,
} from "./-travel-utils";

const placeWrites = mutationFamily("places");

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

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "-created_at", label: "Newest" },
  { key: "-visited_at", label: "Recently visited" },
  { key: "-rating", label: "Top rated" },
  { key: "name", label: "Name" },
];

function DetailRow({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 text-12 text-white/70">
      <span className="mt-0.5 shrink-0 text-white/35 [&_svg]:size-3.5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
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

  const settle = () =>
    settleWhenIdle(queryClient, placeWrites.mutationKey, () => {
      void queryClient.invalidateQueries({ queryKey });
    });

  // A failed delete brings the place back with the refetch in settle().
  const deleteMutation = useMutation({
    ...deletePlaceV1PlacesPlaceIdDeleteMutation({ client }),
    ...placeWrites,
    onMutate: async ({ path }) => {
      await queryClient.cancelQueries({ queryKey });
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
    },
    onError: () => toast.error("Failed to delete place"),
    onSettled: settle,
  });

  const markVisitedMutation = useMutation({
    ...updatePlaceV1PlacesPlaceIdPatchMutation({ client }),
    ...placeWrites,
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
    onError: (_err, { path, body }, context) => {
      restoreItemFields<PlaceSchema>(
        queryClient,
        context?.previous,
        new Set([path.place_id]),
        Object.keys(body) as (keyof PlaceSchema)[],
      );
      toast.error("Failed to update place");
    },
    onSettled: settle,
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

  // Opened from search: the place may be on another page of the list.
  const target = usePageTarget("travel");
  const { data: targetPlace } = useQuery({
    ...getPlaceV1PlacesPlaceIdGetOptions({
      client,
      path: { place_id: target?.id ?? "" },
    }),
    enabled: !!target,
  });
  useEffect(() => {
    if (!target || targetPlace?.id !== target.id) return;
    setSelectedPlace(targetPlace);
    clearPageTarget();
  }, [target, targetPlace]);
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

  const showFilters = !isLoading && !noPlacesAtAll;

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        {showFilters && (
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
                  className={cn(
                    "flex h-6 items-center gap-1.5 rounded-md px-2.5 text-12 transition-colors duration-150",
                    active
                      ? "bg-white/12 text-white/90"
                      : "text-white/50 hover:bg-white/[0.04] hover:text-white/80",
                  )}
                >
                  {tab.label}
                  {tabCounts[tab.key] != null && (
                    <span
                      className={cn(
                        "text-11 tabular-nums",
                        active ? "text-white/55" : "text-white/30",
                      )}
                    >
                      {tabCounts[tab.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          {showFilters && (
            <>
              <div className="relative min-w-32 flex-1 @lg:w-48 @lg:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
                <TextInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search places…"
                  className="h-7 pl-8 text-12"
                />
              </div>
              <Select
                value={sort}
                onValueChange={(value) => {
                  setSort(value as SortKey);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-auto min-w-0 gap-1.5 rounded-lg border-white/10 bg-white/[0.04] text-white/70 shadow-none hover:border-white/15 hover:bg-white/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.06] [&_svg:not([class*='text-'])]:text-white/40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <AddPlaceDialog />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-3">
          <Skeleton className="hidden h-[280px] rounded-xl bg-white/[0.06] @2xl:block" />
          <div className="space-y-px overflow-hidden rounded-xl border border-white/[0.07]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                key={i}
                className="flex items-center gap-3 bg-white/[0.03] px-3 py-2.5"
              >
                <Skeleton className="size-9 rounded-lg bg-white/[0.06]" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/5 bg-white/[0.06]" />
                  <Skeleton className="h-2.5 w-1/4 bg-white/[0.06]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : noPlacesAtAll ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <EmptyState
            icon={<MapPin />}
            title="No places yet"
            className="w-full max-w-sm"
          >
            Save restaurants, sights and spots you want to remember.
          </EmptyState>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="hidden h-[280px] shrink-0 px-3 pt-3 @2xl:block">
              <div className="h-full overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]">
                <Suspense fallback={null}>
                  <PlaceMap
                    places={filtered}
                    onSelectPlace={handleSelectPlace}
                    selectedPlaceId={selectedPlace?.id ?? null}
                  />
                </Suspense>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filtered.length === 0 ? (
                <EmptyState
                  icon={q ? <SearchX /> : <MapPin />}
                  title={q ? "No places match your search" : "Nothing here yet"}
                />
              ) : (
                <Panel>
                  {filtered.map((place) => (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      isSelected={selectedPlace?.id === place.id}
                      onSelect={() => handleSelectPlace(place)}
                      onDelete={() => setDeleteTarget(place)}
                    />
                  ))}
                </Panel>
              )}
              {maxPage > 1 && (
                <div className="mt-3 flex justify-end">
                  <PeriodNav
                    label={`${page} / ${maxPage}`}
                    onPrev={() => setPage((p) => Math.max(1, p - 1))}
                    onNext={() => setPage((p) => Math.min(maxPage, p + 1))}
                    prevDisabled={page <= 1}
                    nextDisabled={page >= maxPage}
                    className="[&>span]:min-w-16"
                  />
                </div>
              )}
            </div>
          </div>

          {selectedPlace && (
            <aside className="hidden w-[300px] shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] bg-chrome @3xl:flex">
              <div className="p-3 pb-0">
                {selectedPlace.photo_url ? (
                  <img
                    src={selectedPlace.photo_url}
                    alt=""
                    className="h-36 w-full rounded-xl border border-white/[0.07] object-cover"
                  />
                ) : (
                  (() => {
                    const Icon = getCategoryIcon(selectedPlace.category);
                    return (
                      <div className="flex h-24 w-full items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
                        <Icon className="size-7 text-white/25" />
                      </div>
                    );
                  })()
                )}
              </div>

              <div className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-15 font-semibold leading-snug text-white/90">
                      {selectedPlace.name}
                    </h3>
                    {(selectedPlace.country || selectedPlace.category) && (
                      <p className="mt-0.5 text-12 capitalize text-white/50">
                        {[
                          selectedPlace.country,
                          selectedPlace.category?.replace(/_/g, " "),
                        ]
                          .filter(Boolean)
                          .join(" - ")}
                      </p>
                    )}
                  </div>
                  <IconButton
                    onClick={() => setSelectedPlace(null)}
                    title="Close"
                    className="-mr-1.5 -mt-1"
                  >
                    <X />
                  </IconButton>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selectedPlace.status} />
                  {!!selectedPlace.visited_at && (
                    <span className="text-12 tabular-nums text-white/45">
                      {formatVisitedDate(selectedPlace.visited_at)}
                    </span>
                  )}
                  {selectedPlace.rating && (
                    <div className="ml-auto">
                      <RatingStars rating={selectedPlace.rating} />
                    </div>
                  )}
                </div>

                {(selectedPlace.tags?.length ?? 0) > 0 && (
                  <TagDisplay tags={selectedPlace.tags!} />
                )}

                <Panel>
                  {selectedPlace.address && (
                    <DetailRow icon={<MapPin />}>
                      <span className="leading-relaxed">
                        {selectedPlace.address}
                      </span>
                    </DetailRow>
                  )}
                  <DetailRow icon={<MapIcon />}>
                    <a
                      href={getGoogleMapsUrl(selectedPlace)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-300 transition-colors duration-150 hover:text-primary-200"
                    >
                      View on Google Maps
                    </a>
                  </DetailRow>
                  {selectedPlace.website && (
                    <DetailRow icon={<Globe />}>
                      <a
                        href={selectedPlace.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-primary-300 transition-colors duration-150 hover:text-primary-200"
                      >
                        {websiteLabel(selectedPlace.website)}
                      </a>
                    </DetailRow>
                  )}
                  {selectedPlace.phone && (
                    <DetailRow icon={<Phone />}>
                      <span className="tabular-nums">
                        {selectedPlace.phone}
                      </span>
                    </DetailRow>
                  )}
                </Panel>

                {selectedPlace.review && (
                  <div>
                    <p className="mb-1.5 text-11 font-semibold tracking-wide text-white/40">
                      Review
                    </p>
                    <p className="whitespace-pre-wrap rounded-lg border-l-2 border-primary-500/40 bg-white/[0.03] px-3 py-2 text-12 leading-relaxed text-white/70">
                      {selectedPlace.review}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-1.5 border-t border-white/[0.07] pt-3">
                  <EditPlaceDialog place={selectedPlace} />
                  {selectedPlace.status !== "visited" && (
                    <SoftButton
                      onClick={() => handleQuickMarkVisited(selectedPlace)}
                      disabled={markVisitedMutation.isPending}
                      className="hover:bg-emerald-500/10 hover:text-emerald-400"
                    >
                      <Check />
                      Mark visited
                    </SoftButton>
                  )}
                  <IconButton
                    destructive
                    title="Delete"
                    className="ml-auto"
                    onClick={() => setDeleteTarget(selectedPlace)}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDeleteDialog
        size="sm"
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete place?"
        description={
          <>
            &ldquo;{deleteTarget?.name}&rdquo; will be permanently removed. This
            can&rsquo;t be undone.
          </>
        }
        onConfirm={handleConfirmDelete}
        isPending={deleteMutation.isPending}
        pendingLabel="Deleting…"
      />
    </div>
  );
}

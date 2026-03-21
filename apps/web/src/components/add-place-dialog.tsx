import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Plus, Search, MapPin, Loader2 } from "lucide-react";
import { TagInput } from "@/components/tag-input";
import { CategorySelect } from "@/components/category-select";
import { Button } from "@metron/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metron/ui/components/dialog";
import { Input } from "@metron/ui/components/input";
import { Label } from "@metron/ui/components/label";
import {
  createPlaceV1PlacesPostMutation,
  listPlacesV1PlacesGetQueryKey,
  searchGooglePlacesV1PlacesSearchGetOptions,
} from "@metron/client";
import type { GooglePlaceSearchResult } from "@metron/client";
import { toast } from "sonner";
import { client } from "@/lib/client";

export function AddPlaceDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"search" | "form">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const queryClient = useQueryClient();

  const { data: searchResults, isLoading: isSearching } = useQuery({
    ...searchGooglePlacesV1PlacesSearchGetOptions({
      client,
      query: { query: searchQuery },
    }),
    enabled: searchEnabled && searchQuery.length >= 2,
  });

  const mutation = useMutation({
    ...createPlaceV1PlacesPostMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: listPlacesV1PlacesGetQueryKey({ client }),
      });
      toast.success("Place added");
      handleClose();
    },
    onError: () => {
      toast.error("Failed to add place");
    },
  });

  const form = useForm({
    defaultValues: {
      name: "",
      address: "",
      country: "",
      latitude: 0,
      longitude: 0,
      googlePlaceId: null as string | null,
      plusCode: null as string | null,
      category: null as string | null,
      photoUrl: null as string | null,
      tags: [] as string[],
      status: "want_to_go" as "want_to_go" | "visited",
      rating: null as number | null,
      visitedAt: "",
      review: "",
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        client,
        body: {
          name: value.name,
          address: value.address || null,
          country: value.country || null,
          latitude: value.latitude,
          longitude: value.longitude,
          google_place_id: value.googlePlaceId,
          plus_code: value.plusCode,
          category: value.category,
          photo_url: value.photoUrl,
          tags: value.tags.length > 0 ? value.tags : null,
          status: value.status,
          rating: value.rating,
          visited_at: value.visitedAt ? new Date(value.visitedAt) : null,
          review: value.review || null,
        },
      });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.length >= 2) {
      setSearchEnabled(true);
    }
  };

  const handleSelectPlace = (result: GooglePlaceSearchResult) => {
    form.setFieldValue("name", result.name);
    form.setFieldValue("address", result.address);
    form.setFieldValue("country", ((result as Record<string, unknown>).country as string) ?? "");
    form.setFieldValue("latitude", result.latitude);
    form.setFieldValue("longitude", result.longitude);
    form.setFieldValue("googlePlaceId", result.place_id);
    form.setFieldValue("plusCode", result.plus_code ?? null);
    form.setFieldValue("category", result.category ?? null);
    form.setFieldValue("photoUrl", result.photo_url ?? null);
    setStep("form");
  };

  const handleManualEntry = () => {
    setStep("form");
  };

  const handleClose = () => {
    setOpen(false);
    setStep("search");
    setSearchQuery("");
    setSearchEnabled(false);
    form.reset();
    mutation.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add New Place
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{step === "search" ? "Search for a Place" : "Add Place"}</DialogTitle>
          <DialogDescription>
            {step === "search"
              ? "Search Google Places or add manually."
              : "Review and save the place details."}
          </DialogDescription>
        </DialogHeader>

        {step === "search" ? (
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchEnabled(false);
                }}
                placeholder="Search restaurants, cafes, landmarks..."
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={searchQuery.length < 2}>
                {isSearching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
              </Button>
            </form>

            {searchResults?.results && searchResults.results.length > 0 && (
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {searchResults.results.map((result) => (
                  <button
                    key={result.place_id}
                    type="button"
                    className="hover:bg-muted w-full rounded-md p-2.5 text-left transition-colors"
                    onClick={() => handleSelectPlace(result)}
                  >
                    <div className="flex items-start gap-2.5">
                      <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <span className="font-medium text-sm truncate">{result.name}</span>
                          {result.category && (
                            <span className="text-muted-foreground text-[10px] bg-muted rounded px-1.5 py-0.5 capitalize shrink-0 whitespace-nowrap">
                              {result.category.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs truncate mt-0.5">
                          {result.address}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchEnabled && searchResults?.results?.length === 0 && (
              <p className="text-muted-foreground text-center text-sm py-4">No results found.</p>
            )}

            <div className="border-t pt-3">
              <Button variant="outline" size="sm" onClick={handleManualEntry} className="w-full">
                Add manually instead
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
            className="space-y-4"
          >
            <form.Field
              name="name"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="place-name">Name</Label>
                  <Input
                    id="place-name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Place name"
                    required
                  />
                </div>
              )}
            />

            <form.Field
              name="address"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="place-address">Address</Label>
                  <Input
                    id="place-address"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Full address"
                  />
                </div>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="country"
                children={(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="place-country">Country</Label>
                    <Input
                      id="place-country"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="e.g. Japan"
                    />
                  </div>
                )}
              />
              <form.Field
                name="category"
                children={(field) => (
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <CategorySelect value={field.state.value} onChange={field.handleChange} />
                  </div>
                )}
              />
            </div>

            <form.Field
              name="tags"
              children={(field) => (
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <TagInput tags={field.state.value} onChange={field.handleChange} />
                </div>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="latitude"
                children={(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="place-lat">Latitude</Label>
                    <Input
                      id="place-lat"
                      type="number"
                      step="any"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      required
                    />
                  </div>
                )}
              />
              <form.Field
                name="longitude"
                children={(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="place-lng">Longitude</Label>
                    <Input
                      id="place-lng"
                      type="number"
                      step="any"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      required
                    />
                  </div>
                )}
              />
            </div>

            {/* Status selector */}
            <form.Field
              name="status"
              children={(field) => (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        field.state.value === "want_to_go"
                          ? "border-amber-500 bg-amber-500/10 text-amber-500"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => field.handleChange("want_to_go")}
                    >
                      Want to go
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        field.state.value === "visited"
                          ? "border-green-500 bg-green-500/10 text-green-500"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => {
                        field.handleChange("visited");
                        if (!form.getFieldValue("visitedAt")) {
                          form.setFieldValue("visitedAt", new Date().toISOString().split("T")[0]);
                        }
                      }}
                    >
                      Visited
                    </button>
                  </div>
                </div>
              )}
            />

            {/* Show rating, date, review when visited */}
            <form.Subscribe
              selector={(state) => [state.values.status] as const}
              children={([status]) =>
                status === "visited" ? (
                  <>
                    <form.Field
                      name="visitedAt"
                      children={(field) => (
                        <div className="space-y-2">
                          <Label htmlFor="place-visited-at">Date visited</Label>
                          <Input
                            id="place-visited-at"
                            type="date"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        </div>
                      )}
                    />

                    <form.Field
                      name="rating"
                      children={(field) => (
                        <div className="space-y-2">
                          <Label>Rating</Label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                className={`text-xl transition-colors ${
                                  field.state.value && star <= field.state.value
                                    ? "text-yellow-500"
                                    : "text-muted-foreground/30 hover:text-yellow-500/50"
                                }`}
                                onClick={() =>
                                  field.handleChange(field.state.value === star ? null : star)
                                }
                              >
                                {"\u2605"}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    />

                    <form.Field
                      name="review"
                      children={(field) => (
                        <div className="space-y-2">
                          <Label htmlFor="place-review">Notes / Review</Label>
                          <textarea
                            id="place-review"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="Your thoughts, tips, what you ordered..."
                            className="border-input bg-background placeholder:text-muted-foreground flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
                          />
                        </div>
                      )}
                    />
                  </>
                ) : null
              }
            />

            {mutation.isError && (
              <p className="text-destructive text-sm">Failed to add place. Please try again.</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("search")}>
                Back
              </Button>
              <form.Subscribe
                selector={(state) => [state.values.name] as const}
                children={([name]) => (
                  <Button type="submit" disabled={mutation.isPending || !name}>
                    {mutation.isPending ? "Saving..." : "Save Place"}
                  </Button>
                )}
              />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

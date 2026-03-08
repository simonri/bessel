import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus, Search, MapPin, Loader2 } from "lucide-react";
import { TagInput } from "@/components/tag-input";
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
import { client } from "@/lib/client";

export function AddPlaceDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"search" | "form">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
  const [plusCode, setPlusCode] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<"want_to_go" | "visited">("want_to_go");
  const [rating, setRating] = useState<number | null>(null);
  const [visitedAt, setVisitedAt] = useState("");
  const [review, setReview] = useState("");

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
      queryClient.invalidateQueries({
        queryKey: listPlacesV1PlacesGetQueryKey({ client }),
      });
      handleClose();
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.length >= 2) {
      setSearchEnabled(true);
    }
  };

  const handleSelectPlace = (result: GooglePlaceSearchResult) => {
    setName(result.name);
    setAddress(result.address);
    setCountry((result as Record<string, unknown>).country as string ?? "");
    setLatitude(result.latitude);
    setLongitude(result.longitude);
    setGooglePlaceId(result.place_id);
    setPlusCode(result.plus_code ?? null);
    setCategory(result.category ?? null);
    setPhotoUrl(result.photo_url ?? null);
    setStep("form");
  };

  const handleManualEntry = () => {
    setStep("form");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !latitude || !longitude) return;

    mutation.mutate({
      client,
      body: {
        name,
        address: address || null,
        country: country || null,
        latitude,
        longitude,
        google_place_id: googlePlaceId,
        plus_code: plusCode,
        category,
        photo_url: photoUrl,
        tags: tags.length > 0 ? tags : null,
        status,
        rating,
        visited_at: visitedAt ? new Date(visitedAt) : null,
        review: review || null,
      },
    });
  };

  const handleClose = () => {
    setOpen(false);
    setStep("search");
    setSearchQuery("");
    setSearchEnabled(false);
    setName("");
    setAddress("");
    setCountry("");
    setLatitude(0);
    setLongitude(0);
    setGooglePlaceId(null);
    setPlusCode(null);
    setCategory(null);
    setPhotoUrl(null);
    setTags([]);
    setStatus("want_to_go");
    setRating(null);
    setVisitedAt("");
    setReview("");
    mutation.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Place
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
              <p className="text-muted-foreground text-center text-sm py-4">
                No results found.
              </p>
            )}

            <div className="border-t pt-3">
              <Button variant="outline" size="sm" onClick={handleManualEntry} className="w-full">
                Add manually instead
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="place-name">Name</Label>
              <Input
                id="place-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Place name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="place-address">Address</Label>
              <Input
                id="place-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full address"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="place-country">Country</Label>
                <Input
                  id="place-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. Japan"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="place-category">Category</Label>
                <Input
                  id="place-category"
                  value={category ?? ""}
                  onChange={(e) => setCategory(e.target.value || null)}
                  placeholder="e.g. restaurant"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <TagInput tags={tags} onChange={setTags} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="place-lat">Latitude</Label>
                <Input
                  id="place-lat"
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="place-lng">Longitude</Label>
                <Input
                  id="place-lng"
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(Number(e.target.value))}
                  required
                />
              </div>
            </div>

            {/* Status selector */}
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    status === "want_to_go"
                      ? "border-amber-500 bg-amber-500/10 text-amber-500"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setStatus("want_to_go")}
                >
                  Want to go
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    status === "visited"
                      ? "border-green-500 bg-green-500/10 text-green-500"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setStatus("visited");
                    if (!visitedAt) setVisitedAt(new Date().toISOString().split("T")[0]);
                  }}
                >
                  Visited
                </button>
              </div>
            </div>

            {/* Show rating, date, review when visited */}
            {status === "visited" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="place-visited-at">Date visited</Label>
                  <Input
                    id="place-visited-at"
                    type="date"
                    value={visitedAt}
                    onChange={(e) => setVisitedAt(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Rating</Label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className={`text-xl transition-colors ${
                          rating && star <= rating
                            ? "text-yellow-500"
                            : "text-muted-foreground/30 hover:text-yellow-500/50"
                        }`}
                        onClick={() => setRating(rating === star ? null : star)}
                      >
                        {"\u2605"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="place-review">Notes / Review</Label>
                  <textarea
                    id="place-review"
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    placeholder="Your thoughts, tips, what you ordered..."
                    className="border-input bg-background placeholder:text-muted-foreground flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}

            {mutation.isError && (
              <p className="text-destructive text-sm">
                Failed to add place. Please try again.
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("search")}>
                Back
              </Button>
              <Button type="submit" disabled={mutation.isPending || !name}>
                {mutation.isPending ? "Saving..." : "Save Place"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

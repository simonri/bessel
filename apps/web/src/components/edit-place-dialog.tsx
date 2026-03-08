import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
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
import type { PlaceSchema } from "@metron/client";
import {
  updatePlaceV1PlacesPlaceIdPatchMutation,
  listPlacesV1PlacesGetQueryKey,
} from "@metron/client";
import { client } from "@/lib/client";

export function EditPlaceDialog({ place }: { place: PlaceSchema }) {
  const placeAny = place as Record<string, unknown>;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(place.name);
  const [address, setAddress] = useState(place.address ?? "");
  const [country, setCountry] = useState((placeAny.country as string) ?? "");
  const [status, setStatus] = useState<"want_to_go" | "visited">((placeAny.status as string) === "visited" ? "visited" : "want_to_go");
  const [rating, setRating] = useState<number | null>(place.rating ?? null);
  const [visitedAt, setVisitedAt] = useState(() => {
    const val = placeAny.visited_at;
    if (!val) return "";
    if (val instanceof Date) return val.toISOString().split("T")[0];
    return String(val);
  });
  const [review, setReview] = useState(place.review ?? "");
  const [category, setCategory] = useState(place.category ?? "");
  const [tags, setTags] = useState<string[]>(() => {
    const val = placeAny.tags;
    return Array.isArray(val) ? val : [];
  });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    ...updatePlaceV1PlacesPlaceIdPatchMutation({ client }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: listPlacesV1PlacesGetQueryKey({ client }),
      });
      setOpen(false);
    },
  });

  const handleOpen = () => {
    setName(place.name);
    setAddress(place.address ?? "");
    setCountry((placeAny.country as string) ?? "");
    setStatus((placeAny.status as string) === "visited" ? "visited" : "want_to_go");
    setRating(place.rating ?? null);
    const val = placeAny.visited_at;
    setVisitedAt(val instanceof Date ? val.toISOString().split("T")[0] : val ? String(val) : "");
    setReview(place.review ?? "");
    setCategory(place.category ?? "");
    setTags(Array.isArray(placeAny.tags) ? placeAny.tags as string[] : []);
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    mutation.mutate({
      client,
      path: { place_id: place.id },
      body: {
        name,
        address: address || null,
        country: country || null,
        status,
        rating,
        visited_at: visitedAt ? new Date(visitedAt) : null,
        review: review || null,
        category: category || null,
        tags: tags.length > 0 ? tags : null,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? handleOpen() : setOpen(false))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Place</DialogTitle>
          <DialogDescription>Update your notes for this place.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-place-name">Name</Label>
            <Input
              id="edit-place-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-place-address">Address</Label>
            <Input
              id="edit-place-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-place-country">Country</Label>
              <Input
                id="edit-place-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-place-category">Category</Label>
              <Input
                id="edit-place-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. restaurant, cafe, museum"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <TagInput tags={tags} onChange={setTags} />
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

          {status === "visited" && (
            <div className="space-y-2">
              <Label htmlFor="edit-place-visited-at">Date visited</Label>
              <Input
                id="edit-place-visited-at"
                type="date"
                value={visitedAt}
                onChange={(e) => setVisitedAt(e.target.value)}
              />
            </div>
          )}

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
            <Label htmlFor="edit-place-review">Notes / Review</Label>
            <textarea
              id="edit-place-review"
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Your thoughts, tips, what you ordered..."
              className="border-input bg-background placeholder:text-muted-foreground flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          {mutation.isError && (
            <p className="text-destructive text-sm">
              Failed to update place. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !name}>
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

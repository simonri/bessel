import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Pencil } from "lucide-react";
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
import type { PlaceSchema } from "@metron/client";
import {
  updatePlaceV1PlacesPlaceIdPatchMutation,
  listPlacesV1PlacesGetQueryKey,
} from "@metron/client";
import { client } from "@/lib/client";

function getInitialVisitedAt(place: Record<string, unknown>): string {
  const val = place.visited_at;
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().split("T")[0];
  return String(val);
}

export function EditPlaceDialog({ place }: { place: PlaceSchema }) {
  const placeAny = place as Record<string, unknown>;
  const [open, setOpen] = useState(false);
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

  const form = useForm({
    defaultValues: {
      name: place.name,
      address: place.address ?? "",
      country: (placeAny.country as string) ?? "",
      status: ((placeAny.status as string) === "visited" ? "visited" : "want_to_go") as "want_to_go" | "visited",
      rating: place.rating ?? (null as number | null),
      visitedAt: getInitialVisitedAt(placeAny),
      review: place.review ?? "",
      category: place.category ?? "",
      tags: (Array.isArray(placeAny.tags) ? placeAny.tags : []) as string[],
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        client,
        path: { place_id: place.id },
        body: {
          name: value.name,
          address: value.address || null,
          country: value.country || null,
          status: value.status,
          rating: value.rating,
          visited_at: value.visitedAt ? new Date(value.visitedAt) : null,
          review: value.review || null,
          category: value.category || null,
          tags: value.tags.length > 0 ? value.tags : null,
        },
      });
    },
  });

  const handleOpen = () => {
    form.reset({
      name: place.name,
      address: place.address ?? "",
      country: (placeAny.country as string) ?? "",
      status: (placeAny.status as string) === "visited" ? "visited" : "want_to_go",
      rating: place.rating ?? null,
      visitedAt: getInitialVisitedAt(placeAny),
      review: place.review ?? "",
      category: place.category ?? "",
      tags: Array.isArray(placeAny.tags) ? (placeAny.tags as string[]) : [],
    });
    setOpen(true);
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field
            name="name"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-place-name">Name</Label>
                <Input
                  id="edit-place-name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  required
                />
              </div>
            )}
          />

          <form.Field
            name="address"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-place-address">Address</Label>
                <Input
                  id="edit-place-address"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <form.Field
              name="country"
              children={(field) => (
                <div className="space-y-2">
                  <Label htmlFor="edit-place-country">Country</Label>
                  <Input
                    id="edit-place-country"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            />
            <form.Field
              name="category"
              children={(field) => (
                <div className="space-y-2">
                  <Label>Category</Label>
                  <CategorySelect value={field.state.value || null} onChange={(v) => field.handleChange(v ?? "")} />
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

          <form.Subscribe
            selector={(state) => [state.values.status] as const}
            children={([status]) =>
              status === "visited" ? (
                <form.Field
                  name="visitedAt"
                  children={(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="edit-place-visited-at">Date visited</Label>
                      <Input
                        id="edit-place-visited-at"
                        type="date"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                  )}
                />
              ) : null
            }
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
                      onClick={() => field.handleChange(field.state.value === star ? null : star)}
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
                <Label htmlFor="edit-place-review">Notes / Review</Label>
                <textarea
                  id="edit-place-review"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Your thoughts, tips, what you ordered..."
                  className="border-input bg-background placeholder:text-muted-foreground flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
            )}
          />

          {mutation.isError && (
            <p className="text-destructive text-sm">
              Failed to update place. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.values.name] as const}
              children={([name]) => (
                <Button type="submit" disabled={mutation.isPending || !name}>
                  {mutation.isPending ? "Saving..." : "Save"}
                </Button>
              )}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

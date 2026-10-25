import type { PlaceSchema } from "@bessel/client";
import { listPlacesQueryKey, updatePlaceMutation } from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@bessel/ui/components/dialog";
import { Input } from "@bessel/ui/components/input";
import { Label } from "@bessel/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CategorySelect } from "@/components/category-select";
import { TagInput } from "@/components/tag-input";
import { IconButton } from "@/components/ui-kit";
import { client } from "@/lib/client";

function getInitialVisitedAt(place: Record<string, unknown>): string {
  const val = place.visited_at;
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().split("T")[0];
  if (typeof val === "string") return val;
  return "";
}

export function EditPlaceDialog({ place }: { place: PlaceSchema }) {
  const placeAny = place as Record<string, unknown>;
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    ...updatePlaceMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: listPlacesQueryKey({ client }),
      });
      toast.success("Place updated");
      setOpen(false);
    },
    onError: () => {
      toast.error("Failed to update place");
    },
  });

  const form = useForm({
    defaultValues: {
      name: place.name,
      address: place.address ?? "",
      country: (placeAny.country as string) ?? "",
      status: ((placeAny.status as string) === "visited"
        ? "visited"
        : "want_to_go") as "want_to_go" | "visited",
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
      status:
        (placeAny.status as string) === "visited" ? "visited" : "want_to_go",
      rating: place.rating ?? null,
      visitedAt: getInitialVisitedAt(placeAny),
      review: place.review ?? "",
      category: place.category ?? "",
      tags: Array.isArray(placeAny.tags) ? (placeAny.tags as string[]) : [],
    });
    setOpen(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? handleOpen() : setOpen(false))}
    >
      <DialogTrigger asChild>
        <IconButton title="Edit">
          <Pencil />
        </IconButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Place</DialogTitle>
          <DialogDescription>
            Update your notes for this place.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="name">
            {(field) => (
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
          </form.Field>

          <form.Field name="address">
            {(field) => (
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
          </form.Field>

          <div className="grid grid-cols-2 gap-3">
            <form.Field name="country">
              {(field) => (
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
            </form.Field>
            <form.Field name="category">
              {(field) => (
                <div className="space-y-2">
                  <Label>Category</Label>
                  <CategorySelect
                    value={field.state.value || null}
                    onChange={(v) => field.handleChange(v ?? "")}
                  />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="tags">
            {(field) => (
              <div className="space-y-2">
                <Label>Tags</Label>
                <TagInput
                  tags={field.state.value}
                  onChange={field.handleChange}
                />
              </div>
            )}
          </form.Field>

          {/* Status selector */}
          <form.Field name="status">
            {(field) => (
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 rounded-md border px-3 py-2 text-13 font-medium transition-colors ${
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
                    className={`flex-1 rounded-md border px-3 py-2 text-13 font-medium transition-colors ${
                      field.state.value === "visited"
                        ? "border-green-500 bg-green-500/10 text-green-500"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => {
                      field.handleChange("visited");
                      if (!form.getFieldValue("visitedAt")) {
                        form.setFieldValue(
                          "visitedAt",
                          new Date().toISOString().split("T")[0],
                        );
                      }
                    }}
                  >
                    Visited
                  </button>
                </div>
              </div>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => [state.values.status] as const}>
            {([status]) =>
              status === "visited" ? (
                <form.Field name="visitedAt">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="edit-place-visited-at">
                        Date visited
                      </Label>
                      <Input
                        id="edit-place-visited-at"
                        type="date"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                  )}
                </form.Field>
              ) : null
            }
          </form.Subscribe>

          <form.Field name="rating">
            {(field) => (
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
                        field.handleChange(
                          field.state.value === star ? null : star,
                        )
                      }
                    >
                      {"\u2605"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form.Field>

          <form.Field name="review">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-place-review">Notes / Review</Label>
                <textarea
                  id="edit-place-review"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Your thoughts, tips, what you ordered..."
                  className="border-input bg-background placeholder:text-muted-foreground flex min-h-[80px] w-full rounded-md border px-3 py-2 text-13"
                />
              </div>
            )}
          </form.Field>

          {mutation.isError && (
            <p className="text-destructive text-13">
              Failed to update place. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <form.Subscribe selector={(state) => [state.values.name] as const}>
              {([name]) => (
                <Button type="submit" disabled={mutation.isPending || !name}>
                  {mutation.isPending ? "Saving..." : "Save"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

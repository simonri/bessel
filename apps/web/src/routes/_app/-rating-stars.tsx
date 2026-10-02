import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingStars({
  rating,
  size = "sm",
}: {
  rating: number;
  size?: "sm" | "md";
}) {
  return (
    <div
      className="flex items-center gap-px"
      role="img"
      aria-label={`${rating} out of 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed five-star row
          key={i}
          className={cn(
            size === "sm" ? "size-3" : "size-4",
            i < rating ? "fill-amber-400 text-amber-400" : "text-white/15",
          )}
        />
      ))}
    </div>
  );
}

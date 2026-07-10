import { Star } from "lucide-react";

export function RatingStars({
  rating,
  size = "sm",
}: {
  rating: number;
  size?: "sm" | "md";
}) {
  const s = size === "sm" ? "size-3" : "size-4";
  return (
    <div className="flex items-center gap-px">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${s} ${i < rating ? "fill-yellow-500 text-yellow-500" : "text-white/15"}`}
        />
      ))}
    </div>
  );
}

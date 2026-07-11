import type { PlaceSchema } from "@bessel/client";
import { format } from "date-fns";
import {
  Beer,
  Building2,
  Church,
  Coffee,
  Drama,
  Dumbbell,
  Hotel,
  IceCream,
  Landmark,
  type LucideIcon,
  MapPin,
  ShoppingBag,
  Store,
  Trees,
  UtensilsCrossed,
  Wine,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  bar: Beer,
  nightclub: Wine,
  shopping: ShoppingBag,
  hotel: Hotel,
  park: Trees,
  landmark: Landmark,
  museum: Landmark,
  theater: Drama,
  temple: Church,
  church: Church,
  mosque: Church,
  synagogue: Church,
  gym: Dumbbell,
  bakery: IceCream,
  market: Store,
  gallery: Building2,
};

export function getCategoryIcon(
  category: string | null | undefined,
): LucideIcon {
  if (!category) return MapPin;
  return CATEGORY_ICONS[category] ?? MapPin;
}

export function formatVisitedDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return format(value, "MMM d, yyyy");
  if (typeof value === "string") return format(new Date(value), "MMM d, yyyy");
  return "";
}

export function getGoogleMapsUrl(place: PlaceSchema): string {
  const placeAny = place as Record<string, unknown>;
  if (typeof placeAny.google_place_id === "string") {
    return `https://www.google.com/maps/place/?q=place_id:${placeAny.google_place_id}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
}

export function getPlaceAny(place: PlaceSchema) {
  const a = place as Record<string, unknown>;
  return {
    country: a.country as string | undefined,
    status: a.status as string,
    visitedAt: a.visited_at,
    googlePlaceId: a.google_place_id as string | undefined,
    tags: Array.isArray(a.tags) ? (a.tags as string[]) : [],
  };
}

// @ts-nocheck — query-core version mismatch between @metron/client and mobile app
import type { PlaceSchema } from "@metron/client";
import {
  MapPin,
  UtensilsCrossed,
  Coffee,
  Beer,
  Hotel,
  ShoppingBag,
  Landmark,
  TreePine,
  Plane,
  Church,
  Dumbbell,
  GraduationCap,
  Stethoscope,
  Building2,
} from "lucide-react-native";

export const PAGE_SIZE = 30;

export const CATEGORIES = [
  "restaurant", "cafe", "bar", "bakery", "hotel", "museum", "park",
  "temple", "shrine", "beach", "shopping", "market", "landmark",
  "nightclub", "spa", "gym", "theater", "gallery", "library",
  "zoo", "aquarium", "airport", "station", "other",
];

export const CATEGORY_ICONS: Record<string, typeof MapPin> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  bar: Beer,
  nightclub: Beer,
  hotel: Hotel,
  shopping: ShoppingBag,
  market: ShoppingBag,
  park: TreePine,
  museum: Landmark,
  landmark: Landmark,
  temple: Church,
  church: Church,
  mosque: Church,
  gym: Dumbbell,
  hospital: Stethoscope,
  university: GraduationCap,
  airport: Plane,
  theater: Building2,
  gallery: Building2,
};

export const CATEGORY_COLORS: Record<string, string> = {
  restaurant: "#f97316",
  cafe: "#a16207",
  bar: "#a855f7",
  nightclub: "#a855f7",
  hotel: "#3b82f6",
  shopping: "#ec4899",
  market: "#ec4899",
  park: "#22c55e",
  museum: "#eab308",
  landmark: "#eab308",
  temple: "#ef4444",
  church: "#ef4444",
  mosque: "#ef4444",
  gym: "#06b6d4",
  hospital: "#ef4444",
  airport: "#6366f1",
};

export function formatDate(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value as string);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function getPlaceFields(place: PlaceSchema) {
  const a = place as Record<string, unknown>;
  return {
    country: a.country as string | undefined,
    status: a.status as string,
    visitedAt: a.visited_at,
    tags: Array.isArray(a.tags) ? (a.tags as string[]) : [],
    googlePlaceId: a.google_place_id as string | undefined,
  };
}

export function getGoogleMapsUrl(place: PlaceSchema): string {
  const a = place as Record<string, unknown>;
  if (typeof a.google_place_id === "string") {
    return `https://www.google.com/maps/place/?q=place_id:${a.google_place_id}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
}

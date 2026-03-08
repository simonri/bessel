import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metron/ui/components/select";

const CATEGORIES = [
  "restaurant",
  "cafe",
  "bar",
  "bakery",
  "hotel",
  "museum",
  "park",
  "temple",
  "shrine",
  "beach",
  "shopping",
  "market",
  "landmark",
  "nightclub",
  "spa",
  "gym",
  "theater",
  "gallery",
  "library",
  "zoo",
  "aquarium",
  "airport",
  "station",
  "other",
] as const;

interface CategorySelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function CategorySelect({ value, onChange }: CategorySelectProps) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => onChange(v || null)}
    >
      <SelectTrigger className="w-full capitalize">
        <SelectValue placeholder="Select category" />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIES.map((cat) => (
          <SelectItem key={cat} value={cat} className="capitalize">
            {cat}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

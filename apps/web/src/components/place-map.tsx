import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PlaceSchema } from "@metron/client";

function createDotIcon(color: string, selected = false) {
  const r = selected ? 6 : 4;
  const stroke = selected ? 2 : 1.5;
  const total = (r + stroke) * 2;
  const center = total / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}">
    <circle cx="${center}" cy="${center}" r="${r}" fill="${color}" stroke="#fff" stroke-width="${stroke}"${selected ? ` filter="drop-shadow(0 0 3px ${color})"` : ""}/>
  </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [total, total] as [number, number],
    iconAnchor: [center, center] as [number, number],
  });
}

const icons = {
  want_to_go: createDotIcon("#f59e0b"),
  visited: createDotIcon("#22c55e"),
  want_to_go_selected: createDotIcon("#f59e0b", true),
  visited_selected: createDotIcon("#22c55e", true),
};

function getIcon(status: string, selected: boolean) {
  if (selected) {
    return status === "visited" ? icons.visited_selected : icons.want_to_go_selected;
  }
  return status === "visited" ? icons.visited : icons.want_to_go;
}

interface PlaceMapProps {
  places: PlaceSchema[];
  onSelectPlace?: (place: PlaceSchema) => void;
  selectedPlaceId?: string | null;
}

export function PlaceMap({ places, onSelectPlace, selectedPlaceId }: PlaceMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: L.Marker; status: string }>>(new Map());
  const onSelectRef = useRef(onSelectPlace);
  onSelectRef.current = onSelectPlace;

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, { scrollWheelZoom: true });

    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "&copy; Esri",
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Rebuild markers when places change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    for (const { marker } of markersRef.current.values()) {
      map.removeLayer(marker);
    }
    markersRef.current.clear();

    if (places.length === 0) return;

    const bounds: L.LatLngExpression[] = [];

    for (const place of places) {
      const pos: L.LatLngExpression = [place.latitude, place.longitude];
      bounds.push(pos);

      const status = (place as Record<string, unknown>).status as string;
      const icon = getIcon(status, false);

      const marker = L.marker(pos, { icon }).addTo(map);
      marker.on("click", () => onSelectRef.current?.(place));

      markersRef.current.set(place.id, { marker, status });
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
    }
  }, [places]);

  // Update icons for selection changes only — no full rebuild
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    for (const [id, { marker, status }] of markersRef.current.entries()) {
      const isSelected = id === selectedPlaceId;
      marker.setIcon(getIcon(status, isSelected));
      marker.setZIndexOffset(isSelected ? 1000 : 0);
    }

    if (selectedPlaceId) {
      const entry = markersRef.current.get(selectedPlaceId);
      if (entry) {
        map.panTo(entry.marker.getLatLng(), { animate: true });
      }
    }
  }, [selectedPlaceId]);

  return (
    <>
      <style>{`
        .leaflet-container { z-index: 0; }
      `}</style>
      <div ref={mapRef} className="h-full w-full" />
    </>
  );
}

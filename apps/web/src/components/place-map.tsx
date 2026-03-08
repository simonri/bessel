import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PlaceSchema } from "@metron/client";

function createSvgIcon(color: string, selected = false) {
  const size = selected ? 36 : 28;
  const strokeWidth = selected ? 2.5 : 1.5;
  const filter = selected
    ? `<defs><filter id="g"><feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="${color}" flood-opacity="0.7"/></filter></defs>`
    : "";
  const filterAttr = selected ? ' filter="url(#g)"' : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${size}" height="${size * 1.5}">
    ${filter}
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="#fff" stroke-width="${strokeWidth}"${filterAttr}/>
    <circle cx="12" cy="12" r="${selected ? 4 : 5}" fill="#fff"/>
  </svg>`;
  const iconSize = selected ? [36, 54] : [28, 42];
  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: iconSize as [number, number],
    iconAnchor: [iconSize[0] / 2, iconSize[1]] as [number, number],
  });
}

const icons = {
  want_to_go: createSvgIcon("#f59e0b"),
  visited: createSvgIcon("#22c55e"),
  want_to_go_selected: createSvgIcon("#f59e0b", true),
  visited_selected: createSvgIcon("#22c55e", true),
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

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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

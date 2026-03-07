import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PlaceSchema } from "@metron/client";

function createSvgIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="#fff"/>
  </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [28, 42],
    iconAnchor: [14, 42],
    popupAnchor: [0, -36],
  });
}

const icons = {
  want_to_go: createSvgIcon("#f59e0b"),
  visited: createSvgIcon("#22c55e"),
};

interface PlaceMapProps {
  places: PlaceSchema[];
  onSelectPlace?: (place: PlaceSchema) => void;
  selectedPlaceId?: string | null;
}

export function PlaceMap({ places, onSelectPlace, selectedPlaceId }: PlaceMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      scrollWheelZoom: true,
    });

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

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing markers
    for (const marker of markersRef.current.values()) {
      map.removeLayer(marker);
    }
    markersRef.current.clear();

    if (places.length === 0) return;

    const bounds: L.LatLngExpression[] = [];

    for (const place of places) {
      const pos: L.LatLngExpression = [place.latitude, place.longitude];
      bounds.push(pos);

      const status = (place as Record<string, unknown>).status as string;
      const icon = status === "visited" ? icons.visited : icons.want_to_go;

      const stars = place.rating
        ? " " + Array.from({ length: place.rating }).map(() => "\u2605").join("")
        : "";

      const statusLabel = status === "visited" ? "Visited" : "Want to go";
      const statusColor = status === "visited" ? "#22c55e" : "#f59e0b";

      const marker = L.marker(pos, { icon }).addTo(map);

      marker.bindPopup(
        `<div style="min-width:180px;font-family:system-ui,sans-serif">` +
          `<div style="font-weight:600;font-size:14px">${place.name}</div>` +
          (place.category ? `<div style="color:#888;font-size:12px;text-transform:capitalize;margin-top:2px">${place.category.replace(/_/g, " ")}</div>` : "") +
          (place.address ? `<div style="color:#888;font-size:11px;margin-top:4px">${place.address}</div>` : "") +
          `<div style="margin-top:6px;display:flex;align-items:center;gap:8px">` +
            `<span style="color:${statusColor};font-size:12px;font-weight:500">${statusLabel}</span>` +
            (stars ? `<span style="color:#f59e0b;font-size:13px">${stars}</span>` : "") +
          `</div>` +
          ((place as Record<string, unknown>).visited_at ? `<div style="color:#888;font-size:11px;margin-top:2px">${(place as Record<string, unknown>).visited_at}</div>` : "") +
          (place.review ? `<div style="font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid #eee;color:#555">${place.review}</div>` : "") +
        `</div>`
      );

      if (onSelectPlace) {
        marker.on("click", () => onSelectPlace(place));
      }

      markersRef.current.set(place.id, marker);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
    }
  }, [places, onSelectPlace]);

  // Highlight selected marker
  useEffect(() => {
    if (!selectedPlaceId) return;
    const marker = markersRef.current.get(selectedPlaceId);
    if (marker) {
      marker.openPopup();
      const map = mapInstanceRef.current;
      if (map) {
        map.panTo(marker.getLatLng(), { animate: true });
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

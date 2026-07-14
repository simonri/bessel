import L from "leaflet";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { PlaceSchema } from "@bessel/client";

function createDotIcon(color: string, selected = false) {
  const r = selected ? 6 : 4.5;
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
  want_to_go: createDotIcon("#fbbf24"),
  visited: createDotIcon("#34d399"),
  want_to_go_selected: createDotIcon("#fbbf24", true),
  visited_selected: createDotIcon("#34d399", true),
};

function getIcon(status: string, selected: boolean) {
  if (selected) {
    return status === "visited"
      ? icons.visited_selected
      : icons.want_to_go_selected;
  }
  return status === "visited" ? icons.visited : icons.want_to_go;
}

interface PlaceMapProps {
  places: PlaceSchema[];
  onSelectPlace?: (place: PlaceSchema) => void;
  selectedPlaceId?: string | null;
}

export function PlaceMap({
  places,
  onSelectPlace,
  selectedPlaceId,
}: PlaceMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: L.Marker; status: string }>>(
    new Map(),
  );
  const onSelectRef = useRef(onSelectPlace);
  onSelectRef.current = onSelectPlace;
  // Fit deferred until the container has a real size — fitBounds against a
  // 0×0 or still-settling container computes a nonsense zoom (whole-world
  // view), which is exactly what happens inside a canvas widget that mounts
  // before the grid finishes layout (or while its workspace is display:none).
  const pendingFitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      scrollWheelZoom: true,
      zoomControl: true,
      minZoom: 2,
      worldCopyJump: true,
    });

    // Dark basemap to match the app (the satellite imagery read as a foreign
    // element in an otherwise dark UI, and place dots got lost on it).
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      },
    ).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Leaflet only measures its container once at init — a canvas widget that
  // resizes (or mounts hidden) leaves the map rendering tiles for the stale
  // size, showing gray dead space. Track the container and re-measure.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const el = mapRef.current;
    if (!map || !el) return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      map.invalidateSize();
      if (pendingFitRef.current) {
        pendingFitRef.current();
        pendingFitRef.current = null;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
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

      const status = (place.status as string) ?? "want_to_go";
      const icon = getIcon(status, false);

      const marker = L.marker(pos, { icon }).addTo(map);
      marker.on("click", () => onSelectRef.current?.(place));

      markersRef.current.set(place.id, { marker, status });
    }

    const fit = () => {
      if (bounds.length === 1) {
        map.setView(bounds[0]!, 13);
      } else {
        map.fitBounds(L.latLngBounds(bounds), {
          padding: [32, 32],
          maxZoom: 15,
        });
      }
    };

    const el = mapRef.current;
    if (el && el.clientWidth > 50 && el.clientHeight > 50) {
      fit();
      pendingFitRef.current = null;
    } else {
      pendingFitRef.current = fit;
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
    <div className="relative h-full w-full">
      <style>{`
        .leaflet-container { z-index: 0; background: #111; font: inherit; }
        .leaflet-bar { border: 1px solid rgba(255,255,255,.1) !important; box-shadow: 0 2px 8px rgba(0,0,0,.5) !important; }
        .leaflet-control-zoom a {
          background: rgba(18,18,18,.9) !important;
          color: rgba(255,255,255,.65) !important;
          border-color: rgba(255,255,255,.08) !important;
        }
        .leaflet-control-zoom a:hover { background: rgba(40,40,40,.95) !important; color: #fff !important; }
        .leaflet-control-attribution {
          background: rgba(0,0,0,.45) !important;
          color: rgba(255,255,255,.3) !important;
        }
        .leaflet-control-attribution a { color: rgba(255,255,255,.45) !important; }
      `}</style>
      <div ref={mapRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-3 rounded-md bg-black/60 px-2 py-1 backdrop-blur-sm">
        <span className="flex items-center gap-1.5 text-10 text-white/65">
          <span className="size-2 rounded-full bg-emerald-400" />
          Visited
        </span>
        <span className="flex items-center gap-1.5 text-10 text-white/65">
          <span className="size-2 rounded-full bg-amber-400" />
          Want to go
        </span>
      </div>
    </div>
  );
}

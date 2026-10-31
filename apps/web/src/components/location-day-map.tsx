import type {
  LocationActivity,
  LocationPoint,
  LocationVisit,
} from "@bessel/client";
import L from "leaflet";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { addDarkBasemap } from "@/lib/map-tiles";
import { type TripLine, tripLines } from "./location-day-lines";

const ROUTE = "#60a5fa";
const VISIT = "#a78bfa";
const SELECTED = "#f5f5f5";
const CASING = "#0b1324";

export type MapSelection = { kind: "visit" | "activity"; id: string } | null;

function visitStyle(selected: boolean): L.CircleMarkerOptions {
  return {
    radius: selected ? 8 : 6,
    color: "#fff",
    weight: selected ? 2.5 : 1.5,
    fillColor: selected ? SELECTED : VISIT,
    fillOpacity: 1,
  };
}

/** Google Maps draws walks as dots, rides as solid lines, flights dashed. */
function lineStyle(line: TripLine, selected: boolean): L.PolylineOptions {
  const walk = line.mode === "walk";
  return {
    color: selected ? SELECTED : ROUTE,
    weight: walk ? (selected ? 7 : 5) : selected ? 6 : 4,
    opacity: line.recorded ? 1 : 0.6,
    lineCap: "round",
    lineJoin: "round",
    dashArray: walk
      ? "0 9"
      : line.mode === "flight" || !line.recorded
        ? "8 8"
        : undefined,
  };
}

function casingStyle(line: TripLine): L.PolylineOptions {
  return {
    color: CASING,
    weight: line.mode === "walk" ? 0 : 7,
    opacity: line.recorded ? 0.9 : 0.5,
    lineCap: "round",
    lineJoin: "round",
    dashArray: line.mode === "flight" || !line.recorded ? "8 8" : undefined,
    interactive: false,
  };
}

export function LocationDayMap({
  visits,
  activities,
  path,
  selection,
  onSelect,
}: {
  visits: LocationVisit[];
  activities: LocationActivity[];
  path: LocationPoint[];
  selection: MapSelection;
  onSelect: (selection: MapSelection) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const visitMarkers = useRef(new Map<string, L.CircleMarker>());
  const drawnLines = useRef(
    new Map<string, { line: TripLine; polyline: L.Polyline }>(),
  );
  const pendingFit = useRef<(() => void) | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      minZoom: 2,
      worldCopyJump: true,
    });
    addDarkBasemap(map);
    map.setView([20, 0], 2);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Leaflet measures its container once; follow resizes, and fit to the
    // day only once there's a real size to fit into.
    const el = containerRef.current;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      map.invalidateSize();
      pendingFit.current?.();
      pendingFit.current = null;
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    visitMarkers.current.clear();
    drawnLines.current.clear();
    const bounds: L.LatLngTuple[] = [];

    for (const line of tripLines(visits, activities, path)) {
      bounds.push(...line.points);
      L.polyline(line.points, casingStyle(line)).addTo(layer);
      const polyline = L.polyline(line.points, lineStyle(line, false))
        .on("click", () =>
          onSelectRef.current({ kind: "activity", id: line.id }),
        )
        .addTo(layer);
      drawnLines.current.set(line.id, { line, polyline });
    }

    for (const visit of visits) {
      if (visit.hierarchy_level !== 0) continue;
      if (visit.latitude == null || visit.longitude == null) continue;
      const position: L.LatLngTuple = [visit.latitude, visit.longitude];
      bounds.push(position);
      const marker = L.circleMarker(position, visitStyle(false))
        .on("click", () => onSelectRef.current({ kind: "visit", id: visit.id }))
        .addTo(layer);
      visitMarkers.current.set(visit.id, marker);
    }

    if (bounds.length === 0) return;
    const fit = () =>
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
    const el = containerRef.current;
    if (el && el.clientWidth > 50 && el.clientHeight > 50) fit();
    else pendingFit.current = fit;
  }, [visits, activities, path]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, marker] of visitMarkers.current) {
      const selected = selection?.kind === "visit" && selection.id === id;
      marker.setStyle(visitStyle(selected));
      if (selected) {
        marker.bringToFront();
        map.panTo(marker.getLatLng(), { animate: true });
      }
    }
    for (const [id, { line, polyline }] of drawnLines.current) {
      const selected = selection?.kind === "activity" && selection.id === id;
      polyline.setStyle(lineStyle(line, selected));
      if (selected) {
        polyline.bringToFront();
        map.fitBounds(polyline.getBounds(), {
          padding: [60, 60],
          maxZoom: 16,
          animate: true,
        });
      }
    }
  }, [selection]);

  return (
    <div className="relative h-full w-full">
      <style>{`
        .location-day-map.leaflet-container { z-index: 0; background: #111; font: inherit; }
        .location-day-map .leaflet-bar { border: 1px solid rgba(255,255,255,.1) !important; box-shadow: 0 2px 8px rgba(0,0,0,.5) !important; }
        .location-day-map .leaflet-control-zoom a {
          background: rgba(18,18,18,.9) !important;
          color: rgba(255,255,255,.65) !important;
          border-color: rgba(255,255,255,.08) !important;
        }
        .location-day-map .leaflet-control-zoom a:hover { background: rgba(40,40,40,.95) !important; color: #fff !important; }
        .location-day-map .leaflet-control-attribution {
          font-size: 10px;
          background: rgba(0,0,0,.45) !important;
          color: rgba(255,255,255,.3) !important;
        }
        .location-day-map .leaflet-control-attribution a { color: rgba(255,255,255,.45) !important; }
      `}</style>
      <div ref={containerRef} className="location-day-map h-full w-full" />
    </div>
  );
}

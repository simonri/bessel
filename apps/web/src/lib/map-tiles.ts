import L from "leaflet";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, HERE, Garmin, Maxar, Earthstar Geographics, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const STORAGE_KEY = "bessel:map-style";

function tiles(service: string, maxNativeZoom: number): L.TileLayer {
  return L.tileLayer(`${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}`, {
    maxNativeZoom,
    maxZoom: 20,
    attribution: ATTRIBUTION,
  });
}

function savedStyle(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveStyle(style: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // The choice just isn't remembered.
  }
}

/** A dark map to match the app, or satellite photos with place names and
 *  roads on top, switchable in the corner; the choice is remembered. Esri's
 *  tiles need no API key (CARTO's dark tiles started requiring one). */
export function addBasemap(map: L.Map): void {
  const styles: Record<string, L.LayerGroup> = {
    Map: L.layerGroup([
      tiles("Canvas/World_Dark_Gray_Base", 16),
      tiles("Canvas/World_Dark_Gray_Reference", 16),
    ]),
    Satellite: L.layerGroup([
      tiles("World_Imagery", 18),
      tiles("Reference/World_Transportation", 18),
      tiles("Reference/World_Boundaries_and_Places", 18),
    ]),
  };
  const saved = savedStyle();
  styles[saved && saved in styles ? saved : "Map"].addTo(map);
  L.control
    .layers(styles, undefined, { position: "topright", collapsed: false })
    .addTo(map);
  map.on("baselayerchange", (event: L.LayersControlEvent) =>
    saveStyle(event.name),
  );
}

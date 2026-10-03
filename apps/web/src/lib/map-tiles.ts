import L from "leaflet";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";

/** Dark basemap with labels on top, to match the app. Esri's canvas tiles
 *  need no API key (CARTO's dark tiles started requiring one). */
export function addDarkBasemap(map: L.Map): void {
  const options: L.TileLayerOptions = {
    maxNativeZoom: 16,
    maxZoom: 20,
  };
  L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    ...options,
    attribution:
      'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  L.tileLayer(
    `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    options,
  ).addTo(map);
}

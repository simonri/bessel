// Builds src/components/world-climate/climate-data.json: a projected world map
// and monthly average temperatures for places across every country.
//
// Places are Natural Earth's populated places (capitals first, then the
// biggest cities, spread out), assigned to the country shape that contains
// them; a country with no listed city gets its centre. Travel destinations
// from world-destinations.json are added on top. Temperatures are NASA
// POWER's 25-year monthly climatology (MERRA-2, 2001-2025) at each point.
// Places that haven't moved keep everything the later build scripts added,
// so those only need to fetch data for new places.
//
// The map is projected here (Equal Earth) so the app ships plain SVG paths
// and needs no geo libraries. Those live outside the repo:
//   npm i --prefix /tmp/climate-deps d3-geo@3 topojson-client@3 world-atlas@2
//   CLIMATE_DEPS=/tmp/climate-deps/node_modules node scripts/build-world-climate.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const deps = process.env.CLIMATE_DEPS;
if (!deps)
  throw new Error(
    "Set CLIMATE_DEPS to a node_modules with d3-geo, topojson-client and world-atlas",
  );
const load = (name, file) => import(pathToFileURL(join(deps, name, file)).href);
const {
  geoArea,
  geoCentroid,
  geoContains,
  geoDistance,
  geoEqualEarth,
  geoPath,
} = await load("d3-geo", "src/index.js");
const { feature } = await load("topojson-client", "src/index.js");
const atlas = (file) =>
  JSON.parse(readFileSync(join(deps, "world-atlas", file), "utf8"));

const PLACES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson";
const POWER_URL =
  "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M&community=RE&format=JSON";
const EARTH_RADIUS_KM = 6371;
/** A destination this close to a city already picked is the same place. */
const SAME_PLACE_KM = 10;
const MAP_WIDTH = 1000;
const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const OUT = new URL(
  "../src/components/world-climate/climate-data.json",
  import.meta.url,
);

/** More places for bigger countries, so one city doesn't stand for a continent. */
function placesFor(areaKm2) {
  if (areaKm2 > 7_000_000) return 8;
  if (areaKm2 > 2_500_000) return 5;
  if (areaKm2 > 1_000_000) return 3;
  if (areaKm2 > 300_000) return 2;
  return 1;
}

/** Capital first, then the biggest cities that aren't too close to one already picked. */
function pick(cities, count, areaKm2) {
  const minGap = Math.sqrt(areaKm2 / count) * 0.6;
  const ordered = [...cities].sort(
    (a, b) => b.capital - a.capital || b.pop - a.pop,
  );
  const chosen = [];
  for (const city of ordered) {
    if (chosen.length === count) break;
    const far = chosen.every(
      (c) =>
        geoDistance([c.lon, c.lat], [city.lon, city.lat]) * EARTH_RADIUS_KM >=
        minGap,
    );
    if (far) chosen.push(city);
  }
  return chosen;
}

async function climatology(lat, lon) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(
      `${POWER_URL}&latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`,
    );
    if (res.ok) {
      const t2m = (await res.json()).properties.parameter.T2M;
      const temps = MONTHS.map((m) => t2m[m]);
      if (temps.some((t) => t === -999 || t == null))
        throw new Error(`no data at ${lat},${lon}`);
      return temps.map((t) => Math.round(t * 10) / 10);
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`POWER kept failing at ${lat},${lon}`);
}

const round3 = (n) => Math.round(n * 1000) / 1000;
const notAntarctica = (f) => f.properties.name !== "Antarctica";

const fine = atlas("countries-50m.json");
const countries = feature(fine, fine.objects.countries).features.filter(
  notAntarctica,
);
const places = (await (await fetch(PLACES_URL)).json()).features.map((f) => ({
  name: f.properties.name,
  lat: f.properties.latitude,
  lon: f.properties.longitude,
  pop: f.properties.pop_max ?? 0,
  capital: f.properties.adm0cap === 1 ? 1 : 0,
}));

// Coastal cities (Stockholm, Lisbon, Reykjavik) often sit just outside the
// simplified outlines; nudge them a few km at a time until one country holds them.
const NUDGES = [0.05, 0.15, 0.3].flatMap((d) => [
  [d, 0],
  [-d, 0],
  [0, d],
  [0, -d],
  [d, d],
  [-d, -d],
  [d, -d],
  [-d, d],
]);
// Border cities the simplified outlines put on the wrong side.
const PLACE_COUNTRY = { Shenzhen: "China" };

function countryOf(place) {
  const fixed = PLACE_COUNTRY[place.name];
  if (fixed) return countries.find((c) => c.properties.name === fixed);
  for (const [dLon, dLat] of [[0, 0], ...NUDGES]) {
    const hit = countries.find((c) =>
      geoContains(c, [place.lon + dLon, place.lat + dLat]),
    );
    if (hit) return hit;
  }
  return null;
}
const placesByCountry = new Map();
for (const place of places) {
  const country = countryOf(place);
  if (country)
    placesByCountry.set(country, [
      ...(placesByCountry.get(country) ?? []),
      place,
    ]);
}

const points = [];
for (const country of countries) {
  const areaKm2 = geoArea(country) * EARTH_RADIUS_KM ** 2;
  const chosen = pick(
    placesByCountry.get(country) ?? [],
    placesFor(areaKm2),
    areaKm2,
  );
  if (chosen.length === 0) {
    const [lon, lat] = geoCentroid(country);
    chosen.push({ name: null, lat, lon, capital: 0 });
  }
  for (const p of chosen) {
    points.push({
      country: country.properties.name,
      name: p.name,
      capital: p.capital === 1,
      lat: round3(p.lat),
      lon: round3(p.lon),
    });
  }
}

const destinations = JSON.parse(
  readFileSync(new URL("world-destinations.json", import.meta.url), "utf8"),
);
for (const destination of destinations) {
  const near = points.find(
    (p) =>
      p.name &&
      geoDistance([p.lon, p.lat], [destination.lon, destination.lat]) *
        EARTH_RADIUS_KM <
        SAME_PLACE_KM,
  );
  if (near) {
    console.log(`${destination.name} is already in as ${near.name}`);
    continue;
  }
  const country = countryOf(destination);
  if (!country) throw new Error(`No country holds ${destination.name}`);
  points.push({
    country: country.properties.name,
    name: destination.region
      ? `${destination.name} (${destination.region})`
      : destination.name,
    capital: false,
    lat: round3(destination.lat),
    lon: round3(destination.lon),
  });
}

const before = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const previous = new Map(
  (before.points ?? []).map((p) => [`${p.lat},${p.lon}`, p]),
);
const known = new Map([...previous].map(([key, p]) => [key, p.temps]));
const missing = points.filter((p) => !known.has(`${p.lat},${p.lon}`));
console.log(
  `${countries.length} countries, ${points.length} places, ${missing.length} to fetch`,
);
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < missing.length) {
      const point = missing[next++];
      known.set(
        `${point.lat},${point.lon}`,
        await climatology(point.lat, point.lon),
      );
    }
  }),
);

const coarse = atlas("countries-110m.json");
const shapes = feature(coarse, coarse.objects.countries).features.filter(
  notAntarctica,
);
const projection = geoEqualEarth().fitWidth(MAP_WIDTH, {
  type: "FeatureCollection",
  features: shapes,
});
const path = geoPath(projection).digits(1);
const [[, top], [, bottom]] = path.bounds({
  type: "FeatureCollection",
  features: shapes,
});

writeFileSync(
  OUT,
  `${JSON.stringify({
    source:
      "NASA POWER monthly climatology (MERRA-2, 2001-2025); places from Natural Earth",
    width: MAP_WIDTH,
    height: Math.ceil(bottom - top),
    top: Math.floor(top),
    shapes: shapes.map((s) => ({ name: s.properties.name, d: path(s) })),
    points: points.map((p) => {
      const [x, y] = projection([p.lon, p.lat]);
      return {
        ...previous.get(`${p.lat},${p.lon}`),
        ...p,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        temps: known.get(`${p.lat},${p.lon}`),
      };
    }),
    ...(before.countries && { countries: before.countries }),
  })}\n`,
);
console.log(`wrote ${shapes.length} shapes and ${points.length} places`);

/// <reference types="google.maps" />
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import groups from "./places.json";

// See references/map.md for the trip-card and place fields.
type Group = {
  name: string;
  flag: string;
  country: string;
  place: string;
  stay: string;
  price: number | string;
  description: string;
  places: {
    kind: string;
    name: string;
    placeId?: string;
    lat: number;
    lng: number;
    description?: string;
    url?: string;
    note?: string;
  }[];
  routes?: number[][];
};

const colors = ["#00acc1", "#fb8c00", "#e53935", "#43a047", "#8e24aa"];
function tripInk(color: string) {
  const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) * 0.84 + 255 * 0.08);
  const linear = rgb.map((v) => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000" : "#fff";
}

const glyphs: Record<string, string> = {
  airport: "✈",
  hotel: "🏨",
  beach: "🏖",
  hike: "🥾",
  sight: "⛰",
  market: "🛍",
  food: "🍜",
  cafe: "☕",
  bar: "🍹",
};
const escapeHTML = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const card = document.getElementById("card")!;
const legend = document.getElementById("legend")!;
// Replaced at build time by `travel map build`.
const key = process.env.GOOGLE_MAPS_API_KEY;
if (!key) throw new Error("No Maps key; build with `bun run travel map build <folder>`.");
setOptions({ key, v: "weekly" });
const [{ Map, Polyline }, { AdvancedMarkerElement, PinElement }, , { Route }, { LatLngBounds }] = await Promise.all([
  importLibrary("maps"),
  importLibrary("marker"),
  importLibrary("places"), // registers <gmp-place-details>
  importLibrary("routes"),
  importLibrary("core"),
]);

const map = new Map(document.getElementById("map")!, {
  mapId: "DEMO_MAP_ID",
  mapTypeId: "hybrid",
  streetViewControl: false,
});
const all = new LatLngBounds();

/** Google's own place card (Places UI Kit). Must be built with createElement; innerHTML on the container doesn't load. */
function showCard(placeId: string) {
  card.classList.add("open");
  const details = document.createElement("gmp-place-details");
  details.addEventListener("gmp-error", (e) => console.error("place card", placeId, e));
  details.innerHTML = `<gmp-place-details-place-request place="${placeId}"></gmp-place-details-place-request><gmp-place-all-content></gmp-place-all-content>`;
  card.replaceChildren(details);
}

for (const [i, group] of (groups as Group[]).entries()) {
  const color = colors[i % colors.length]!;
  const bounds = new LatLngBounds();
  const row = document.createElement("button");
  row.type = "button";
  row.className = "trip";
  row.style.setProperty("--trip-color", color);
  row.style.setProperty("--trip-ink", tripInk(color));
  row.innerHTML = `<span class="trip-top"><span class="trip-country">${escapeHTML(group.flag)} ${escapeHTML(group.country)}</span><span class="trip-price">${typeof group.price === "number" ? `A$${group.price.toLocaleString("en-AU")} <small>pp</small>` : escapeHTML(group.price)}</span></span><span class="trip-place">${escapeHTML(group.place)} · ${escapeHTML(group.stay)}</span><span class="trip-description">${escapeHTML(group.description)}</span>`;
  row.onclick = () => map.fitBounds(bounds, 120);
  legend.append(row);
  for (const p of group.places) {
    const position = { lat: p.lat, lng: p.lng };
    const pin = new PinElement({
      background: color,
      borderColor: "#fff",
      glyphColor: "#fff",
      glyphText: glyphs[p.kind] ?? "",
    } as google.maps.marker.PinElementOptions);
    const marker = new AdvancedMarkerElement({
      map,
      position,
      title: p.name,
      content: pin as unknown as Node,
      gmpClickable: true,
    });
    marker.addEventListener("gmp-click", () => {
      if (p.description) {
        card.classList.add("open");
        card.innerHTML = `<div style="padding:24px;line-height:1.5"><button onclick="this.closest('#card').replaceChildren()">Close</button>${p.description}</div>`;
      } else if (p.placeId) showCard(p.placeId);
    });
    bounds.extend(position);
    all.extend(position);
  }
  for (const [from, to] of group.routes ?? []) {
    const a = group.places[from!]!,
      b = group.places[to!]!;
    Route.computeRoutes({
      origin: { lat: a.lat, lng: a.lng },
      destination: { lat: b.lat, lng: b.lng },
      travelMode: "DRIVING",
      fields: ["path", "durationMillis", "distanceMeters"],
    }).then(
      ({ routes }) => {
        const r = routes?.[0];
        if (!r?.path) throw new Error(`No route ${a.name} → ${b.name}`);
        new Polyline({ map, path: r.path, strokeColor: color, strokeWeight: 5, strokeOpacity: 0.9 });
      },
      (e: unknown) => {
        console.error(group.name, e);
      },
    );
  }
}
map.fitBounds(all, 60);

// ?place=<placeId> opens that place's card on load.
const initial = new URLSearchParams(location.search).get("place");
if (initial) showCard(initial);

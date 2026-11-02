/// <reference types="google.maps" />
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import data from "./trip.json";

// See references/map.md for every trip.json field.
type Place = {
  name: string;
  placeId?: string;
  lat: number;
  lng: number;
  country?: string;
  description?: string;
};
type Item = {
  id?: string;
  kind: string;
  name: string;
  time?: string;
  detail?: string;
  price?: string;
  booking?: "booked" | "to book";
  suggest?: boolean;
  replaces?: string;
  choice?: string;
  why?: string;
  places?: Place[];
  from?: Place;
  to?: Place;
};
type Day = { date?: string; title?: string; place: string; country: string; items: Item[] };
type Trip = { title: string; subtitle?: string; days: Day[] };
const trip = data as Trip;

// Country colours avoid the Gemini blue reserved for AI suggestions.
const vivid = ["#00acc1", "#fb8c00", "#3949ab", "#d81b60", "#00897b", "#f4b400", "#6d4c41", "#546e7a"];
const gemini = "#4285f4";
const glyphs: Record<string, string> = {
  flight: "✈️",
  train: "🚆",
  ferry: "⛴️",
  boat: "🚤",
  drive: "🚗",
  walk: "🚶",
  stay: "🛏️",
  beach: "🏖️",
  hike: "🥾",
  sight: "🏛️",
  museum: "🏺",
  mosque: "🕌",
  church: "⛪",
  castle: "🏰",
  view: "🌅",
  park: "🌳",
  village: "🏘️",
  market: "🛍️",
  food: "🍽️",
  cafe: "☕",
  bar: "🍸",
  bath: "🛁",
  tour: "🧭",
  event: "⭐",
  eclipse: "🌑",
  dive: "🤿",
  stars: "🌌",
};
const moving = new Set(["flight", "train", "ferry", "drive", "walk"]);

const esc = (value = "") =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const flag = (code: string) =>
  /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "";
const countryName = new Intl.DisplayNames(["en"], { type: "region" });
const parseDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) =>
  parseDate(d).toLocaleDateString("en-AU", { timeZone: "UTC", ...o });

// Countries in order of first appearance; each gets the next Vivid colour.
const countries: string[] = [];
const addCountry = (c?: string) => c && !countries.includes(c) && countries.push(c);
for (const day of trip.days) addCountry(day.country);
for (const day of trip.days)
  for (const item of day.items) for (const p of [...(item.places ?? []), item.from, item.to]) addCountry(p?.country);
const colorOf = (c: string) => vivid[countries.indexOf(c) % vivid.length] ?? vivid[0]!;

// Replace targets, item keys and the options the user has picked (saved in the browser).
const byId = new Map(trip.days.flatMap((d) => d.items.filter((i) => i.id).map((i) => [i.id!, i] as const)));
const keyOf = new Map<Item, string>();
const dayOf = new Map<Item, number>();
trip.days.forEach((d, di) => d.items.forEach((item, ii) => (keyOf.set(item, `${di}:${ii}`), dayOf.set(item, di))));
const storeKey = `trip:${trip.title}:picked`;
const picked = new Set<string>(JSON.parse(localStorage.getItem(storeKey) ?? "[]"));
const isPicked = (item: Item) => picked.has(keyOf.get(item)!);
function togglePick(item: Item) {
  const k = keyOf.get(item)!;
  if (picked.has(k)) picked.delete(k);
  else {
    picked.add(k);
    // Picking one option of a group unpicks the others.
    if (item.choice)
      for (const other of trip.days[dayOf.get(item)!]!.items)
        if (other !== item && other.choice === item.choice) picked.delete(keyOf.get(other)!);
  }
  localStorage.setItem(storeKey, JSON.stringify([...picked]));
  refresh();
}

// Replaced at build time by `travel map build`.
const key = process.env.GOOGLE_MAPS_API_KEY;
if (!key) throw new Error("No Maps key; build with `bun run travel map build <folder>`.");
setOptions({ key, v: "weekly" });
const [
  { Map: GoogleMap, Polyline },
  { AdvancedMarkerElement, PinElement },
  ,
  { Route },
  { LatLngBounds },
  { spherical },
] = await Promise.all([
  importLibrary("maps"),
  importLibrary("marker"),
  importLibrary("places"), // registers <gmp-place-details>
  importLibrary("routes"),
  importLibrary("core"),
  importLibrary("geometry"),
]);

const map = new GoogleMap(document.getElementById("map")!, {
  mapId: "DEMO_MAP_ID",
  mapTypeId: "hybrid",
  streetViewControl: false,
  fullscreenControl: false,
});

/* ---------- Right panel: Google's place card ---------- */
const placePanel = document.getElementById("place")!;
const placeBody = document.getElementById("place-body")!;
document.getElementById("place-close")!.onclick = () => (placePanel.hidden = true);
function showPlace(p: Place) {
  placePanel.hidden = false;
  if (p.description) {
    placeBody.innerHTML = `<div class="authored"><h2>${esc(p.name)}</h2>${p.description}</div>`;
    return;
  }
  if (!p.placeId) return;
  // Places UI Kit must be built with createElement; innerHTML on the container doesn't load it.
  const details = document.createElement("gmp-place-details");
  details.addEventListener("gmp-error", (e) => console.error("place card", p.placeId, e));
  details.innerHTML = `<gmp-place-details-place-request place="${esc(p.placeId)}"></gmp-place-details-place-request><gmp-place-all-content></gmp-place-all-content>`;
  placeBody.replaceChildren(details);
}

/* ---------- Map layers ---------- */
type Layer = { dim(on: boolean): void; pick?(on: boolean): void };
const layers = new Map<Item, Layer[]>();
const rows = new Map<Item, HTMLElement>();
const all = new LatLngBounds();
const placesOf = (item: Item) => [item.from, ...(item.places ?? []), item.to].filter((p): p is Place => !!p);
const fit = (ps: Place[]) => {
  if (!ps.length) return;
  if (ps.length === 1) return (map.panTo(ps[0]!), map.setZoom(Math.max(map.getZoom() ?? 0, 14)));
  const b = new LatLngBounds();
  for (const p of ps) b.extend(p);
  map.fitBounds(b, 80);
};

function marker(item: Item, p: Place, country: string) {
  const s = item.suggest;
  const color = colorOf(p.country ?? country);
  const pin = new PinElement({
    background: s ? "#fff" : color,
    borderColor: s ? gemini : "#fff",
    glyphColor: "#fff",
    glyphText: glyphs[item.kind] ?? "",
    scale: s ? 0.95 : 1.05,
  } as google.maps.marker.PinElementOptions);
  const m = new AdvancedMarkerElement({
    map,
    position: p,
    title: p.name,
    content: pin as unknown as Node,
    gmpClickable: true,
  });
  m.addEventListener("gmp-click", () => {
    showPlace(p);
    const row = rows.get(item);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    select(row);
  });
  all.extend(p);
  return {
    dim: (on: boolean) => (m.style.opacity = on ? "0.4" : ""),
    // A picked option is filled in Gemini blue; an unpicked one stays a white outline.
    pick: (on: boolean) => Object.assign(pin, { background: on ? gemini : "#fff", scale: on ? 1.05 : 0.95 }),
  };
}

function line(item: Item, country: string): Layer | undefined {
  const { from: a, to: b, kind } = item;
  if (!a || !b) return;
  const color = colorOf(b.country ?? country);
  const opacity = item.suggest ? 0.65 : 1;
  const dash = (path: string, scale: number, repeat: string, stroke: string) => ({
    icon: { path, strokeOpacity: opacity, strokeColor: stroke, scale },
    offset: "0",
    repeat,
  });
  let polys: google.maps.Polyline[] = [];
  let dimmed = false;
  const straight = (icons: google.maps.IconSequence[], geodesic = true) =>
    (polys = [new Polyline({ map, path: [a, b], geodesic, strokeOpacity: 0, icons })]);
  if (kind === "flight") {
    straight([dash("M 0,-1 0,1", 2.5, "14px", "#fff")]);
    // ✈️ emoji at the arc's midpoint, turned to the flight's heading (the emoji itself points north-east).
    const mid = spherical.interpolate(a, b, 0.5);
    // The wrapper centres the emoji on the point; only the inner span rotates, so the turn can't shift it off the arc.
    const el = document.createElement("div");
    el.className = "plane";
    const glyph = document.createElement("span");
    glyph.textContent = "✈️";
    glyph.style.rotate = `${spherical.computeHeading(mid, b) - 45}deg`;
    el.append(glyph);
    new AdvancedMarkerElement({ map, position: mid, content: el, zIndex: -1 });
  } else if (kind === "train")
    straight(
      [
        {
          icon: {
            path: 0 /* SymbolPath.CIRCLE */,
            fillColor: color,
            fillOpacity: opacity,
            strokeWeight: 0,
            scale: 2.5,
          },
          repeat: "10px",
        },
      ],
      false,
    );
  else if (kind === "ferry") straight([dash("M 0,-1 0,1", 2.5, "12px", "#8ab4f8")], false);
  else {
    const travelMode = kind === "walk" ? "WALKING" : "DRIVING";
    Route.computeRoutes({ origin: a, destination: b, travelMode, fields: ["path"] })
      .then(({ routes }) => {
        const path = routes?.[0]?.path;
        if (!path) throw new Error(`No route ${a.name} → ${b.name}`);
        polys = [new Polyline({ map, path, strokeColor: color, strokeWeight: 5, strokeOpacity: 0.9 * opacity })];
      })
      .catch((e: unknown) => {
        console.error(item.name, e);
        straight([dash("M 0,-1 0,1", 2.5, "10px", color)], false);
      })
      .then(() => layer.dim(dimmed));
  }
  const layer = {
    dim: (on: boolean) => {
      dimmed = on;
      const f = on ? 0.35 : 1;
      for (const p of polys) {
        const icons = p.get("icons") as google.maps.IconSequence[] | undefined;
        if (!icons?.length) p.setOptions({ strokeOpacity: 0.9 * opacity * f });
        else
          p.setOptions({
            icons: icons.map((s) => {
              const icon = s.icon as google.maps.Symbol;
              return {
                ...s,
                icon: {
                  ...icon,
                  strokeOpacity: icon.strokeWeight === 0 ? 0 : opacity * f,
                  fillOpacity: icon.fillOpacity ? opacity * f : 0,
                },
              };
            }),
          });
      }
    },
  };
  return layer;
}

/* ---------- Left panel: timeline ---------- */
const timeline = document.getElementById("timeline")!;
let active: HTMLElement | undefined;
function select(row?: HTMLElement) {
  active?.classList.remove("active");
  active = row;
  row?.classList.add("active");
}

const dated = trip.days.filter((d) => d.date).map((d) => d.date!);
const span =
  dated.length > 1
    ? `${fmt(dated[0]!, { day: "numeric", month: "short" })} – ${fmt(dated.at(-1)!, { day: "numeric", month: "short", year: "numeric" })} · ${dated.length} days`
    : "";
document.getElementById("title")!.textContent = trip.title;
document.getElementById("subtitle")!.textContent = [span, trip.subtitle].filter(Boolean).join(" · ");

const chips = document.getElementById("countries")!;
for (const c of new Set(trip.days.map((d) => d.country))) {
  const chip = document.createElement("button");
  chip.className = "chip";
  chip.innerHTML = `<span class="dot" style="background:${colorOf(c)}"></span>${flag(c)} ${esc(countryName.of(c) ?? c)}`;
  chip.onclick = () => fit(trip.days.filter((d) => d.country === c).flatMap((d) => d.items.flatMap(placesOf)));
  chips.append(chip);
}
function badges(item: Item) {
  const out: string[] = [];
  if (item.booking === "booked") out.push(`<span class="badge booked">🎟️ Booked</span>`);
  if (item.booking === "to book") out.push(`<span class="badge to-book">📝 To book</span>`);
  const target = item.replaces ? byId.get(item.replaces) : undefined;
  if (target) out.push(`<span class="badge replace">🔁 Instead of ${esc(target.name)}</span>`);
  if (item.choice) out.push(`<span class="badge choice">🔀 Pick one: ${esc(item.choice)}</span>`);
  return out.join("");
}

function itemRow(item: Item, country: string) {
  const row = document.createElement("div");
  row.className = `item${item.suggest ? " suggestion" : ""}${moving.has(item.kind) ? " move" : ""}`;
  const color = colorOf(item.to?.country ?? item.places?.[0]?.country ?? country);
  row.style.setProperty("--c", item.suggest ? gemini : color);
  const ps = placesOf(item);
  const sub = (item.places?.length ?? 0) > 1 ? item.places! : [];
  const detail = [item.time, item.detail].filter(Boolean).map((s) => esc(s));
  row.innerHTML = `
    <span class="icon">${glyphs[item.kind] ?? "📍"}</span>
    <span class="body">
      <span class="line1"><span class="name">${esc(item.name)}</span>${item.price ? `<span class="price">${esc(item.price)}</span>` : ""}</span>
      ${detail.length ? `<span class="detail">${detail.join(" · ")}</span>` : ""}
      ${item.why ? `<span class="why">${esc(item.why)}</span>` : ""}
      <span class="badges">${badges(item)}</span>
      ${sub.length ? `<span class="subplaces"></span>` : ""}
    </span>`;
  const subEl = row.querySelector(".subplaces");
  for (const p of sub) {
    const b = document.createElement("button");
    b.className = "mini-chip";
    b.title = "Open this place";
    b.textContent = `📍 ${p.name}`;
    b.onclick = (e) => (e.stopPropagation(), select(row), fit([p]), showPlace(p));
    subEl?.append(b);
  }
  if (item.suggest) {
    const pick = document.createElement("button");
    pick.className = "pick";
    pick.onclick = (e) => (e.stopPropagation(), togglePick(item));
    row.append(pick);
  }
  row.tabIndex = 0;
  row.onclick = () => {
    select(row);
    fit(ps);
    const single = item.places?.length === 1 ? item.places[0] : !moving.has(item.kind) ? ps[0] : undefined;
    if (single && (single.placeId || single.description)) showPlace(single);
  };
  row.onkeydown = (e) => e.key === "Enter" && row.click();
  rows.set(item, row);
  const ls: Layer[] = ps.map((p) => marker(item, p, country));
  const l = line(item, country);
  if (l) ls.push(l);
  layers.set(item, ls);
  return row;
}

// Each day lists its plan, then its AI options. Picking an option (+ → ✓) moves it into the plan.
const dayLists: { day: Day; plan: HTMLElement; options: HTMLElement; count: HTMLElement }[] = [];
for (const day of trip.days) {
  const section = document.createElement("section");
  section.className = "day";
  const head = document.createElement("button");
  head.className = "day-head";
  const when = day.date ? fmt(day.date, { weekday: "short", day: "numeric", month: "short" }) : (day.title ?? "");
  head.innerHTML = `<span class="day-when">${esc(when)}<span class="day-n">${day.date ? `Day ${dated.indexOf(day.date) + 1}` : ""}${day.date && day.title ? ` · ${esc(day.title)}` : ""}</span></span><span class="day-where">${flag(day.country)} ${esc(day.place)}</span>`;
  head.onclick = () => fit(day.items.flatMap(placesOf));
  head.style.setProperty("--c", colorOf(day.country));
  const plan = document.createElement("div");
  plan.className = "items";
  const count = document.createElement("div");
  count.className = "options-head";
  const options = document.createElement("div");
  options.className = "options";
  section.append(head, plan, count, options);
  timeline.append(section);
  for (const item of day.items) itemRow(item, day.country);
  dayLists.push({ day, plan, options, count });
}

// Material Symbols "add" and "check" (the pick button is the one non-emoji icon).
const addIcon = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2z"/></svg>`;
const checkIcon = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="m9.55 18-5.7-5.7 1.43-1.43 4.27 4.28 9.18-9.18 1.42 1.43z"/></svg>`;

/** Places each row in its day's plan or options and applies picks, replacements and pick-one groups to rows and pins. */
function refresh() {
  const replaced = new Set<string>();
  const taken = new Set<string>(); // "day:choice" groups that already have a pick
  for (const [item] of layers)
    if (item.suggest && isPicked(item)) {
      if (item.replaces) replaced.add(item.replaces);
      if (item.choice) taken.add(`${dayOf.get(item)}:${item.choice}`);
    }
  for (const { day, plan, options, count } of dayLists) {
    let open = 0;
    for (const item of day.items) {
      const row = rows.get(item)!;
      const inPlan = !item.suggest || isPicked(item);
      const passed = !!item.choice && !inPlan && taken.has(`${dayOf.get(item)}:${item.choice}`);
      (inPlan ? plan : options).append(row);
      if (!inPlan) open++;
      const out = !!item.id && replaced.has(item.id);
      row.classList.toggle("picked", !!item.suggest && inPlan);
      row.classList.toggle("passed", passed);
      row.classList.toggle("replaced-item", out);
      const pick = row.querySelector<HTMLButtonElement>(".pick");
      if (pick) {
        pick.innerHTML = inPlan ? checkIcon : addIcon;
        pick.classList.toggle("on", inPlan);
        pick.title = inPlan ? "Remove from plan" : "Add to plan";
      }
      for (const l of layers.get(item)!) {
        l.dim(out || passed);
        if (item.suggest) l.pick?.(inPlan);
      }
    }
    count.textContent = open ? `✨ ${open} option${open === 1 ? "" : "s"} · + to add` : "";
    count.hidden = !open;
  }
}
refresh();
map.fitBounds(all, 60);

// ?place=<placeId> opens that place's card on load.
const initial = new URLSearchParams(location.search).get("place");
if (initial) showPlace({ name: "", placeId: initial, lat: 0, lng: 0 });

/// <reference types="google.maps" />
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import data from "./trip.json";

// See references/map.md for every trip.json field.
type Place = {
  name: string;
  detail?: string;
  placeId?: string;
  lat: number;
  lng: number;
  country?: string;
  description?: string;
};
type Item = {
  kind: string;
  name: string;
  time?: string;
  detail?: string;
  price?: string;
  /** Not shown on the map; booked items are never replaced. */
  booking?: "booked" | "to book";
  suggest?: boolean;
  endOfDay?: boolean;
  choice?: string;
  /** Older trips: an `id` target that a suggestion `replaces`, imported as a shared `choice`. */
  id?: string;
  replaces?: string;
  why?: string;
  places?: Place[];
  from?: Place;
  to?: Place;
};
type DayLocation = { name: string; country: string };
type Day = { date?: string; title?: string; place: string; country: string; locations?: DayLocation[]; items: Item[] };
type Trip = { title: string; days: Day[] };
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
const activityKinds = new Set([
  "boat", "beach", "hike", "sight", "museum", "mosque", "church", "castle", "view", "park",
  "village", "market", "food", "cafe", "bar", "bath", "tour", "eclipse", "dive", "stars",
]);

const esc = (value = "") =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const flag = (code: string) =>
  /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "";
const parseDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) =>
  parseDate(d).toLocaleDateString("en-AU", { timeZone: "UTC", ...o });

// Countries in order of first appearance; each gets the next Vivid colour.
const countries: string[] = [];
const addCountry = (c?: string) => c && !countries.includes(c) && countries.push(c);
for (const day of trip.days) addCountry(day.country);
for (const day of trip.days)
  for (const item of day.items) for (const p of [...(item.places ?? []), item.from, item.to]) addCountry(p?.country);
for (const day of trip.days) for (const p of day.locations ?? []) addCountry(p.country);
const colorOf = (c: string) => vivid[countries.indexOf(c) % vivid.length] ?? vivid[0]!;

// Item keys and the options the user has picked (saved in the browser).
const keyOf = new Map<Item, string>();
const dayOf = new Map<Item, number>();
const storeKey = `trip:${trip.title}:picked`;
const picked = new Set<string>(JSON.parse(localStorage.getItem(storeKey) ?? "[]"));
trip.days.forEach((day, dayIndex) => {
  const byId = new Map(day.items.filter((item) => item.id).map((item) => [item.id!, item]));
  for (const item of day.items) {
    const target = item.replaces ? byId.get(item.replaces) : undefined;
    if (target) target.choice = item.choice = target.choice ?? item.choice ?? target.name;
  }
  day.items = day.items.flatMap((item, itemIndex) => {
    const optionalByDefault = item.suggest === undefined && activityKinds.has(item.kind);
    if (optionalByDefault) item.suggest = true;
    const positionKey = `${dayIndex}:${itemIndex}`;
    const itemKey = optionalByDefault ? `activity:${positionKey}` : positionKey;
    const places = item.places ?? [];
    if (places.length <= 1 || item.from || item.to) {
      keyOf.set(item, itemKey);
      dayOf.set(item, dayIndex);
      return [item];
    }

    const wasPicked = !!item.suggest && picked.delete(itemKey);
    return places.map((place, index) => {
      const stop: Item = { ...item, name: place.name, places: [place] };
      if (index > 0) {
        delete stop.time;
        delete stop.detail;
        delete stop.why;
        delete stop.price;
      }
      if (place.detail) stop.detail = place.detail;
      const stopKey = `${itemKey}:place:${index}`;
      keyOf.set(stop, stopKey);
      dayOf.set(stop, dayIndex);
      if (wasPicked && (!item.choice || index === 0)) picked.add(stopKey);
      return stop;
    });
  });
  const selectedChoices = new Map<string, string>();
  for (const item of day.items) {
    if (!item.suggest || !item.choice) continue;
    const itemKey = keyOf.get(item)!;
    if (!picked.has(itemKey)) continue;
    const previous = selectedChoices.get(item.choice);
    if (previous) picked.delete(previous);
    selectedChoices.set(item.choice, itemKey);
  }
});
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
  { AdvancedMarkerElement },
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

const mapElement = document.getElementById("map")!;
const map = new GoogleMap(mapElement, {
  mapId: "DEMO_MAP_ID",
  mapTypeId: "hybrid",
  streetViewControl: false,
  fullscreenControl: false,
});
const updateOverview = () => {
  mapElement.classList.toggle("map-overview", (map.getZoom() ?? 0) < 9);
};
map.addListener("zoom_changed", updateOverview);
updateOverview();

/* ---------- Right panel: Google's place card ---------- */
const placePanel = document.getElementById("place")!;
const placeBody = document.getElementById("place-body")!;
document.getElementById("place-close")!.onclick = () => (placePanel.hidden = true);
type PlaceCard = {
  id: string;
  element: HTMLElement;
  ready: boolean;
  reviews?: { section: HTMLElement; ready: boolean };
};
const placeCards = new Map<string, PlaceCard>();
let shownCard: PlaceCard | undefined;
const placeStatus = document.createElement("div");
placeStatus.className = "place-status authored";
placeStatus.setAttribute("role", "status");
placeStatus.textContent = "Google Maps details couldn’t load.";

function withPlaceCardStyles<T>(createOrMount: () => T): T {
  const attachShadow = Element.prototype.attachShadow;
  // The Google widget places its action row inside a closed shadow root.
  Element.prototype.attachShadow = function (init) {
    const root = attachShadow.call(this, init);
    if (this.localName === "gmp-place-details") {
      queueMicrotask(() => {
        const style = document.createElement("style");
        style.textContent = `
          :host(.place-overview) .basic-info {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: start;
            column-gap: 10px;
            padding: 8px 16px 4px;
            padding-inline-end: 56px !important;
          }
          :host(.place-overview) gmp-internal-place-basic-info {
            min-width: 0;
          }
          :host(.place-overview) .actions-main {
            margin: 0;
            padding: 0;
          }
          :host(.place-overview) .contacts-section {
            padding-block: 0;
          }
          :host(.place-review-widget) .basic-info,
          :host(.place-review-widget) .scroll-container > hr:first-of-type {
            display: none !important;
          }
        `;
        root.append(style);
      });
    }
    return root;
  };
  try {
    return createOrMount();
  } finally {
    Element.prototype.attachShadow = attachShadow;
  }
}

function createPlaceCard(id: string): PlaceCard {
  // Places UI Kit must be built with createElement; innerHTML on the container doesn't load it.
  const element = withPlaceCardStyles(() => document.createElement("gmp-place-details"));
  element.classList.add("place-overview");
  const card: PlaceCard = { id, element, ready: false };
  const handleError = (event: Event) => {
    if (placeCards.get(id) === card) {
      placeCards.delete(id);
      if (shownCard !== card) {
        element.remove();
        card.reviews?.section.remove();
      }
      else placeBody.prepend(placeStatus);
    }
    console.error("place card", id, event);
  };
  element.addEventListener("gmp-error", handleError);
  element.addEventListener("gmp-requesterror", handleError);
  element.addEventListener("gmp-load", () => {
    card.ready = true;
    element.classList.add("place-card-ready");
    if (shownCard === card) {
      placeStatus.remove();
      setCardVisible(card, true);
    }
    preloadReviews(card);
  });
  element.innerHTML = `
    <gmp-place-details-place-request place="${esc(id)}"></gmp-place-details-place-request>
    <gmp-place-media lightbox-preferred></gmp-place-media>
    <gmp-place-attribution></gmp-place-attribution>
    <gmp-place-name></gmp-place-name>
    <gmp-place-address></gmp-place-address>
    <gmp-place-rating></gmp-place-rating>
    <gmp-place-opening-hours></gmp-place-opening-hours>
    <gmp-place-website></gmp-place-website>`;
  return card;
}

function preloadPlace(p: Place) {
  if (p.description || !p.placeId || placeCards.has(p.placeId)) return;
  const card = createPlaceCard(p.placeId);
  placeCards.set(card.id, card);
  setCardVisible(card, false);
  withPlaceCardStyles(() => placeBody.append(card.element));
}

function setCardVisible(card: PlaceCard, visible: boolean) {
  card.element.classList.toggle("place-card-inactive", !visible);
  card.element.inert = !visible;
  if (card.reviews) {
    const showReviews = visible && card.reviews.ready;
    card.reviews.section.classList.toggle("place-card-inactive", !showReviews);
    card.reviews.section.inert = !showReviews;
  }
}

function preloadReviews(card: PlaceCard) {
  if (card.reviews) return;
  const section = document.createElement("section");
  section.className = "place-reviews place-card-inactive";
  section.inert = true;
  const widget = withPlaceCardStyles(() => document.createElement("gmp-place-details"));
  widget.classList.add("place-review-widget");
  widget.innerHTML = `<gmp-place-details-place-request place="${esc(card.id)}"></gmp-place-details-place-request><gmp-place-reviews></gmp-place-reviews>`;
  const reviews = { section, ready: false };
  card.reviews = reviews;
  widget.addEventListener("gmp-load", () => {
    widget.classList.add("place-card-ready");
    reviews.ready = true;
    if (shownCard === card) setCardVisible(card, card.ready);
  });
  widget.addEventListener("gmp-requesterror", () => {
    section.remove();
    card.reviews = undefined;
  });
  section.append(widget);
  withPlaceCardStyles(() => card.element.after(section));
}

function hideCurrentCard() {
  if (shownCard) {
    if (placeCards.get(shownCard.id) === shownCard) setCardVisible(shownCard, false);
    else {
      shownCard.element.remove();
      shownCard.reviews?.section.remove();
    }
    shownCard = undefined;
  }
  placeBody.querySelector(":scope > .authored")?.remove();
}

function showPlace(p: Place) {
  if (!p.description && !p.placeId) return;
  placePanel.hidden = false;
  if (p.description) {
    hideCurrentCard();
    placeBody.insertAdjacentHTML("beforeend", `<div class="authored"><h2>${esc(p.name)}</h2>${p.description}</div>`);
    placeBody.scrollTop = 0;
    return;
  }
  const id = p.placeId!;
  const cached = placeCards.get(id);
  if (cached && shownCard === cached) return;
  hideCurrentCard();
  const card = cached ?? createPlaceCard(id);
  placeCards.set(id, card);
  shownCard = card;
  // Revealing an existing widget leaves it connected, so its card doesn't load again.
  setCardVisible(card, card.ready);
  if (!card.element.isConnected) withPlaceCardStyles(() => placeBody.append(card.element));
  if (card.ready) preloadReviews(card);
  placeBody.scrollTop = 0;
}

/* ---------- Map layers ---------- */
type Layer = { dim(on: boolean): void; select(on: boolean): void; pick?(on: boolean): void };
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

function marker(item: Item, p: Place) {
  const s = item.suggest;
  const pin = document.createElement("div");
  pin.className = "map-pin";
  const glyph = document.createElement("span");
  glyph.className = "map-pin-glyph";
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = glyphs[item.kind] ?? "📍";
  pin.append(glyph);
  pin.style.setProperty("--pin-fill", s ? "#fff" : gemini);
  const m = new AdvancedMarkerElement({
    map,
    position: p,
    title: p.name,
    content: pin,
    gmpClickable: true,
  });
  m.addEventListener("gmp-click", () => {
    showPlace(p);
    dayLists[dayOf.get(item)!]?.setExpanded(true);
    const row = rows.get(item);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    select(row);
  });
  all.extend(p);
  let dimmed = false;
  let selected = false;
  const updateMarker = () => {
    m.style.opacity = dimmed && !selected ? "0.4" : "";
    m.zIndex = selected ? 1000 : null;
    pin.classList.toggle("selected", selected);
  };
  return {
    dim: (on: boolean) => {
      dimmed = on;
      updateMarker();
    },
    select: (on: boolean) => {
      selected = on;
      updateMarker();
    },
    pick: (on: boolean) => {
      pin.style.setProperty("--pin-fill", on ? gemini : "#fff");
    },
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
  let selected = false;
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
      const f = selected ? 1 / opacity : on ? 0.35 : 1;
      for (const p of polys) {
        p.setOptions({ zIndex: selected ? 1000 : 0 });
        const icons = p.get("icons") as google.maps.IconSequence[] | undefined;
        if (!icons?.length) p.setOptions({ strokeOpacity: 0.9 * opacity * f, strokeWeight: selected ? 9 : 5 });
        else
          p.setOptions({
            icons: icons.map((s) => {
              const icon = s.icon as google.maps.Symbol;
              return {
                ...s,
                icon: {
                  ...icon,
                  scale: selected ? 4 : 2.5,
                  strokeOpacity: icon.strokeWeight === 0 ? 0 : opacity * f,
                  fillOpacity: icon.fillOpacity ? opacity * f : 0,
                },
              };
            }),
          });
      }
    },
    select: (on: boolean) => {
      selected = on;
      layer.dim(dimmed);
    },
  };
  return layer;
}

/* ---------- Left panel: timeline ---------- */
const timeline = document.getElementById("timeline")!;
let active: HTMLElement | undefined;
let activeItem: Item | undefined;
function select(row?: HTMLElement) {
  active?.classList.remove("active");
  if (activeItem) for (const layer of layers.get(activeItem) ?? []) layer.select(false);
  active = row;
  row?.classList.add("active");
  activeItem = row ? itemsByRow.get(row) : undefined;
  if (activeItem) for (const layer of layers.get(activeItem) ?? []) layer.select(true);
}
const itemsByRow = new WeakMap<HTMLElement, Item>();

function itemRow(item: Item, country: string) {
  const row = document.createElement("div");
  row.className = item.suggest ? "item suggestion" : "item";
  const ps = placesOf(item);
  const single = item.places?.length === 1 ? item.places[0] : !moving.has(item.kind) ? ps[0] : undefined;
  const detail = esc([item.time, item.detail, item.why].filter(Boolean).join(" · "));
  row.innerHTML = `
    <span class="icon">${glyphs[item.kind] ?? "📍"}</span>
    <span class="body">
      <span class="line1"><span class="name">${esc(item.name)}</span>${item.price ? `<span class="price">${esc(item.price)}</span>` : ""}</span>
      ${detail ? `<span class="detail" title="${detail}">${detail}</span>` : ""}
    </span>`;
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
    if (single && (single.placeId || single.description)) showPlace(single);
  };
  row.onkeydown = (e) => e.key === "Enter" && row.click();
  rows.set(item, row);
  itemsByRow.set(row, item);
  const ls: Layer[] = ps.map((p) => marker(item, p));
  const l = line(item, country);
  if (l) ls.push(l);
  layers.set(item, ls);
  return row;
}

// Each day lists its plan, then its AI options. Picking an option (+ → ✓) moves it into the plan.
const dayLists: {
  day: Day;
  plan: HTMLElement;
  options: HTMLElement;
  setExpanded: (expanded: boolean) => void;
}[] = [];
for (const [index, day] of trip.days.entries()) {
  const section = document.createElement("section");
  section.className = "day";
  const head = document.createElement("button");
  head.type = "button";
  head.className = "day-head";
  const date = day.date ? fmt(day.date, { weekday: "short", day: "numeric", month: "short" }) : "";
  const when = [date, day.title].filter(Boolean).join(" · ");
  const locations = day.locations?.length
    ? day.locations
    : day.place.split("→").map((name) => ({ name: name.trim(), country: day.country }));
  const pills = locations.map(({ name, country }, position) => `<span class="day-location">
    ${position ? '<span class="day-route-arrow" aria-hidden="true">→</span>' : ""}
    <span class="day-where" style="--c:${colorOf(country)}"><span>${flag(country)}</span><span>${esc(name)}</span></span>
  </span>`).join("");
  head.innerHTML = `<span class="day-when">${esc(when)}</span><span class="day-locations">${pills}</span>`;
  const content = document.createElement("div");
  content.id = `day-content-${index + 1}`;
  head.setAttribute("aria-controls", content.id);
  const setExpanded = (expanded: boolean) => {
    content.hidden = !expanded;
    head.setAttribute("aria-expanded", String(expanded));
  };
  setExpanded(false);
  head.onclick = () => {
    const expanded = content.hidden === true;
    setExpanded(expanded);
    if (expanded) {
      const places = day.items.flatMap(placesOf);
      fit(places);
      for (const place of places) preloadPlace(place);
    }
  };
  const plan = document.createElement("div");
  plan.className = "items";
  const options = document.createElement("div");
  options.className = "options";
  content.append(plan, options);
  section.append(head, content);
  timeline.append(section);
  for (const item of day.items) itemRow(item, day.country);
  dayLists.push({ day, plan, options, setExpanded });
}

// Material Symbols "add" and "check" (the pick button is the one non-emoji icon).
const addIcon = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2z"/></svg>`;
const checkIcon = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="m9.55 18-5.7-5.7 1.43-1.43 4.27 4.28 9.18-9.18 1.42 1.43z"/></svg>`;

/** Places each row in its day's plan or options and applies picks to rows and pins. */
function refresh() {
  for (const { day, plan, options } of dayLists) {
    const groups = new Map<string, HTMLElement>();
    const taken = new Set(day.items.filter((item) => item.suggest && isPicked(item)).map((item) => item.choice));
    const closingRows: HTMLElement[] = [];
    options.replaceChildren();
    for (const item of day.items) {
      const row = rows.get(item)!;
      const inPlan = !item.suggest || isPicked(item);
      const passed = !!item.choice && !inPlan && taken.has(item.choice);
      let destination = inPlan ? plan : options;
      if (!inPlan && item.choice) {
        let group = groups.get(item.choice);
        if (!group) {
          group = document.createElement("section");
          const heading = document.createElement("h3");
          heading.className = "choice-heading";
          heading.textContent = `Pick one: ${item.choice}`;
          group.append(heading);
          options.append(group);
          groups.set(item.choice, group);
        }
        destination = group;
      }
      if (inPlan && item.endOfDay) closingRows.push(row);
      else destination.append(row);
      row.classList.toggle("passed", passed);
      const pick = row.querySelector<HTMLButtonElement>(".pick");
      if (pick) {
        pick.innerHTML = inPlan ? checkIcon : addIcon;
        pick.classList.toggle("on", inPlan);
        pick.title = inPlan ? "Remove from plan" : "Add to plan";
      }
      for (const l of layers.get(item)!) {
        l.dim(passed);
        if (item.suggest) l.pick?.(inPlan);
      }
    }
    plan.append(...closingRows);
  }
}
refresh();
map.fitBounds(all, 60);

// ?place=<placeId> opens that place's card on load.
const initial = new URLSearchParams(location.search).get("place");
if (initial) showPlace({ name: "", placeId: initial, lat: 0, lng: 0 });

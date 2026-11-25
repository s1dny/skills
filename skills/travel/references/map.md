# Map

A satellite Google map of a whole trip, delivered as one HTML file that opens from disk. Google still serves imagery, place cards and routes over the internet.

```sh
bun run travel map init /abs/trip-map          # copies the template and installs it
# write /abs/trip-map/trip.json
bun run travel map build /abs/trip-map --title "Eclipse 2027"   # → /abs/trip-map/map.html
```

For edits, rebuild to the existing HTML path with `--out`.

## Layout

The template is styled like a built-in Google Maps panel: Google Sans / Google Sans Text, #1f1f1f text, #e8eaed dividers, 8px chips and Google's elevation shadow.

- **Left: the trip timeline.** One sticky header per day shows the date and a single row of location pills. Each pill has a name and flag, with arrows between consecutive locations. Days start collapsed. Click a header to expand it and fit the map to that day, then click again to collapse it. Clicking a map pin expands the corresponding day and highlights its step. Clicking a step fits the map to it and opens its place card.
- **Centre: the map.** Each country gets the next colour: cyan, orange, indigo, pink, teal, amber, brown, slate. Gemini blue is reserved for AI suggestions. Pins show an emoji inside a coloured circle with a white rim and short point. Unpicked options use white pins. Fixed and picked items use blue pins. Selected pins enlarge. Flights are white dashed great-circle arcs with a plane. Trains are dotted lines, ferries are light-blue dashes, and drives and walks follow real Routes API paths.
- **Right: Google's place card only**, a third of the window wide. It opens when you click a pin or a step, and closes with ✕. Opening a day preloads its place cards in parallel. The map reuses them for the current tab session. Trip information never goes here.

## Plan vs AI options

Each day starts with fixed logistics such as transfers, flights and stays. Sightseeing, meals and other activities start as options with a plus button, alongside suggested alternatives. Set `suggest: true` for other optional items or `suggest: false` for an explicitly fixed activity. Each option has one place. Give every item one short, useful line under its title using `detail` for planned steps or `why` for suggestions. Use the title for the stop or action and the detail line for new information, such as timing, logistics, or what to look for. The map truncates overflow with an ellipsis. None of them changes the plan until the user taps its **+** button. The option then moves into the plan, its button becomes a filled blue check and its pin fills blue. Picks are saved in the browser. Set `endOfDay: true` on closing steps such as an early night or overnight stay. The map keeps these steps at the end of the plan as options are added.

Give mutually exclusive activities on the same day a shared `choice` label. They appear under one **Pick one** heading. Adding an option removes any other selected option in that group from the plan.

Give the user plenty to choose from: about 6–10 options on every full day, each one place with a one-line `why`. Never put several options in one card. Never suggest replacing a `booked` item.

All icons are emoji, including kind glyphs and the plane on flight arcs. The exceptions are the add/check pick button and the place panel close button, which are Material icons.

## trip.json

```json
{
  "title": "Phuket & Langkawi",
  "days": [
    {
      "date": "2026-12-02",
      "place": "Kata",
      "country": "TH",
      "locations": [{ "name": "Sydney", "country": "AU" }, { "name": "Kata", "country": "TH" }],
      "items": [
        { "kind": "flight", "name": "Sydney → Phuket", "time": "10:05", "detail": "JQ27 · arrives 16:00", "booking": "booked",
          "from": { "name": "Sydney Airport", "placeId": "ChIJ…", "lat": -33.95, "lng": 151.18, "country": "AU" },
          "to": { "name": "Phuket International Airport", "placeId": "ChIJ…", "lat": 8.105, "lng": 98.305 } },
        { "kind": "sight", "name": "Big Buddha", "choice": "Afternoon", "detail": "Hilltop views over southern Phuket.", "places": [{ "name": "Phuket Big Buddha", "placeId": "ChIJ…", "lat": 7.83, "lng": 98.31 }] },
        { "kind": "market", "name": "Old Phuket Town", "suggest": true, "choice": "Afternoon", "why": "Sino-Portuguese shophouses and cafés.", "places": [ … ] },
        { "kind": "sight", "name": "Promthep Cape", "suggest": true, "choice": "Sunset", "why": "…", "places": [ … ] },
        { "kind": "sight", "name": "Karon Viewpoint", "suggest": true, "choice": "Sunset", "why": "…", "places": [ … ] }
      ]
    }
  ]
}
```

- **Day:** `date` (ISO; optional for undated sections such as "Where to stay"), `place` (fallback header location), `country` (default ISO 3166 alpha-2 for flags and colours), optional `title` and `items` in time order. For travel days, use `locations` in route order with a `name` and `country` for each stop shown in the header. Older `place` strings with arrows split into pills using the day's country.
- **Item:** `kind`, `name`, plus optional `time`, `detail` (flight number, duration, nights), `price` (short string with currency and basis), `booking` (`"booked"` or `"to book"`; not shown, but booked items are never replaced), `suggest`, `endOfDay`, `choice` and `why` (one line, for suggestions). Older trips with `id` and `replaces` still load: each replacement and its target become one `choice` group.
- **Movement items** (`kind` flight, train, ferry, drive, walk) have `from` and `to` places, which are drawn as a line. For other items, write one stop per entry with a single place in `places`. The template also splits older multi-place entries into separate rows with their own pins and place cards. Shared notes appear on the first row. Set `detail` on each subsequent place to give its row a distinct subtitle.
- **Place:** `name`, `lat`, `lng`, `placeId` (opens Google's card) and optional `country` (defaults to the day's country; set it on the departure airport of an international flight). For a place without a Google place ID, such as a private rental, give an authored HTML `description` with a dated listing link instead. Coordinates may be approximate; say so in the description.
- `kind` sets the emoji: flight ✈️, train 🚆, ferry ⛴️, boat 🚤, drive 🚗, walk 🚶, stay 🛏️, beach 🏖️, hike 🥾, sight 🏛️, museum 🏺, mosque 🕌, church ⛪, castle 🏰, view 🌅, park 🌳, village 🏘️, market 🛍️, food 🍽️, cafe ☕, bar 🍸, bath 🛁, tour 🧭, event ⭐, eclipse 🌑, dive 🤿, stars 🌌.
- Only drive between road-connected places. A failed route falls back to a dashed straight line and is logged in the browser console.
- `?place=<placeId>` opens a card on load. Edit the folder's `map.ts`/`index.html` freely; `build` bundles them.

Report fetch dates, stay dates and inclusions for prices alongside the delivered file, not on the map.

## Google Cloud

Key `trip-maps-local` in project `trip-maps-512505` (account plarza@plarza.com; manage with `gcloud services api-keys`). On 23 October 2026 the user approved removing its website restrictions so that files opened from disk work. It is restricted to four APIs: `maps-backend` (Maps JavaScript), `places`, `placewidgets` (Places UI Kit; without it the card fails with 403 on `GetPlaceWidget`) and `routes`. The key is visible in the built HTML, so don't commit or publish built maps. An AUD 1 budget alert is set.

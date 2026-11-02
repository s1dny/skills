# Map

A satellite Google map of a whole trip, delivered as one HTML file that opens from disk. Google still serves imagery, place cards and routes over the internet.

```sh
bun run travel map init /abs/trip-map          # copies the template and installs it
# write /abs/trip-map/trip.json
bun run travel map build /abs/trip-map --title "Eclipse 2027"   # → /abs/trip-map/map.html
```

## Layout

The template is styled like a built-in Google Maps panel: Google Sans / Google Sans Text, #1f1f1f text, #e8eaed dividers, 8px chips and Google's elevation shadow.

- **Left: the trip timeline.** Title, date span, a chip for each country (click to fit the map to that country) and a key. Below that, one sticky header per day (date, day number, flag and night place; click it to fit the day). Each item is a step on a rail, like Google's directions steps. Clicking a step fits the map to it and opens its place card.
- **Centre: the map.** Each country gets the next colour: cyan, orange, indigo, pink, teal, amber, brown, slate. Gemini blue is reserved for AI suggestions. Planned pins are filled with the country colour; suggestion pins are white with a blue outline. Flights are white dashed great-circle arcs with a plane. Trains are dotted lines, ferries are light-blue dashes, and drives and walks follow real Routes API paths.
- **Right: Google's place card only**, a third of the window wide. It opens when you click a pin or a step, and closes with ✕. Trip information never goes here.

## Plan vs AI options

Each day lists its plan first: the user's own items as plain white steps, with `booking` shown as **🎟️ Booked** or **📝 To book**. Below that, under **✨ N options · + to add**, come the AI options. Each option is its own card with a glowing Gemini-blue outline and one place. None of them changes the plan until the user taps its **+** button. The option then moves into the plan, its button becomes a filled blue check and its pin fills blue. Picks are saved in the browser.

Mark each option with `suggest: true`. Two optional fields change what picking it does:

| Fields              | Badge                  | When the option is picked                                                            |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| none                | none                   | it joins the plan                                                                    |
| `replaces: "<id>"`  | **🔁 Instead of X**    | X is struck through and its pin dimmed                                               |
| `choice: "<label>"` | **🔀 Pick one: label** | the other options with that label on that day fade, and picking one unpicks the rest |

`replaces` and `choice` combine, for example several "Instead of Knossos" alternatives.

Give the user plenty to choose from: about 6–10 options on every full day, each one place with a one-line `why`. Never put several options in one card. Never suggest replacing a `booked` item.

All icons are emoji, including kind glyphs, badges and the plane on flight arcs. The exceptions are the add/check pick button and the place panel close button, which are Material icons.

## trip.json

```json
{
  "title": "Phuket & Langkawi",
  "subtitle": "2 adults",
  "days": [
    {
      "date": "2026-12-02",
      "place": "Kata",
      "country": "TH",
      "items": [
        { "kind": "flight", "name": "Sydney → Phuket", "time": "10:05", "detail": "JQ27 · arrives 16:00", "booking": "booked",
          "from": { "name": "Sydney Airport", "placeId": "ChIJ…", "lat": -33.95, "lng": 151.18, "country": "AU" },
          "to": { "name": "Phuket International Airport", "placeId": "ChIJ…", "lat": 8.105, "lng": 98.305 } },
        { "id": "big-buddha", "kind": "sight", "name": "Big Buddha", "places": [{ "name": "Phuket Big Buddha", "placeId": "ChIJ…", "lat": 7.83, "lng": 98.31 }] },
        { "kind": "market", "name": "Old Phuket Town", "suggest": true, "replaces": "big-buddha", "why": "One line on why it is better.", "places": [ … ] },
        { "kind": "sight", "name": "Promthep Cape", "suggest": true, "choice": "Sunset", "why": "…", "places": [ … ] },
        { "kind": "sight", "name": "Karon Viewpoint", "suggest": true, "choice": "Sunset", "why": "…", "places": [ … ] }
      ]
    }
  ]
}
```

- **Day:** `date` (ISO; optional for undated sections such as "Where to stay"), `place` (where you sleep, or "In transit"), `country` (ISO 3166 alpha-2, which gives the flag, name and colour), optional `title` and `items` in time order.
- **Item:** `kind`, `name`, plus optional `id`, `time`, `detail` (flight number, duration, nights), `price` (short string with currency and basis), `booking`, `suggest`, `replaces`, `choice` and `why` (one line, for suggestions).
- **Movement items** (`kind` flight, train, ferry, drive, walk) have `from` and `to` places, which are drawn as a line. **Everything else** has `places`. When there are several, each place gets a 📍 chip in the step. The chips are the stops that step visits, not options: click one to open its card.
- **Place:** `name`, `lat`, `lng`, `placeId` (opens Google's card) and optional `country` (defaults to the day's country; set it on the departure airport of an international flight). For a place without a Google place ID, such as a private rental, give an authored HTML `description` with a dated listing link instead. Coordinates may be approximate; say so in the description.
- `kind` sets the emoji: flight ✈️, train 🚆, ferry ⛴️, boat 🚤, drive 🚗, walk 🚶, stay 🛏️, beach 🏖️, hike 🥾, sight 🏛️, museum 🏺, mosque 🕌, church ⛪, castle 🏰, view 🌅, park 🌳, village 🏘️, market 🛍️, food 🍽️, cafe ☕, bar 🍸, bath 🛁, tour 🧭, event ⭐, eclipse 🌑, dive 🤿, stars 🌌.
- Only drive between road-connected places. A failed route falls back to a dashed straight line and is logged in the browser console.
- `?place=<placeId>` opens a card on load. Edit the folder's `map.ts`/`index.html` freely; `build` bundles them.

Report fetch dates, stay dates and inclusions for prices alongside the delivered file, not on the map.

## Google Cloud

Key `trip-maps-local` in project `trip-maps-512505` (account plarza@plarza.com; manage with `gcloud services api-keys`). On 23 October 2026 the user approved removing its website restrictions so that files opened from disk work. It is restricted to four APIs: `maps-backend` (Maps JavaScript), `places`, `placewidgets` (Places UI Kit; without it the card fails with 403 on `GetPlaceWidget`) and `routes`. The key is visible in the built HTML, so don't commit or publish built maps. An AUD 1 budget alert is set.

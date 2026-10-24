# Map

A satellite Google map with one coloured group of pins per option, Google's own place card on click and driving routes. Delivered as one HTML file that opens from disk; Google still serves imagery, cards and routes over the internet.

```sh
bun run travel map init /abs/trip-map          # copies the template and installs it
# write /abs/trip-map/places.json
bun run travel map build /abs/trip-map --title "Langkawi vs Krabi"   # → /abs/trip-map/map.html
```

The template uses Roboto with Arial/sans-serif fallbacks, square corners, and a permanent right sidebar. Place details occupy its top; trip cards sit at its bottom. Each trip uses the next Vivid colour (cyan, orange, red, green, purple) across its translucent card background, map pins and driving routes. There is no palette picker, coloured dot, route list or pricing footer.

Keep cards brief: country flag and country name, place and stay name, price, and one short description. Put detailed property notes and links in the place panel instead.

`places.json`, one group per option:

```json
[
  {
    "name": "Langkawi · Maneh Villa",
    "flag": "🇲🇾",
    "country": "Malaysia",
    "place": "Langkawi",
    "stay": "Maneh Villa",
    "price": "A$2,070 pp",
    "description": "Private-pool villa close to the beach and restaurants.",
    "places": [
      { "kind": "airport", "name": "Langkawi International Airport", "placeId": "ChIJ…", "lat": 6.342, "lng": 99.731 },
      { "kind": "hotel", "name": "Maneh Villa Langkawi", "placeId": "ChIJ…", "lat": 6.282, "lng": 99.733 },
      { "kind": "hike", "name": "Seven Wells Waterfall", "placeId": "ChIJ…", "lat": 6.383, "lng": 99.668 }
    ],
    "routes": [
      [0, 1],
      [1, 2]
    ]
  }
]
```

- `kind` sets the pin glyph: airport, hotel, beach, hike, sight, market, food, cafe, bar.
- `price` is a short display string with currency and basis (for example `A$2,070 pp`); a number is formatted as AUD per person. Example prices above illustrate the schema, not a current quote. Report fetch date, stay dates and inclusions alongside the delivered file, without adding a footer to the map.
- Clicking a trip card fits the map to its places.
- `routes` are driving index pairs. Draw them in the trip colour without filling the cards with route timings.
- Places with `placeId` open Google's place card. For a private rental without a Google place ID, omit `placeId` and supply an authored HTML `description` with a dated listing link; this opens in the same panel. Coordinates may be approximate and should be labelled in the description.
- `?place=<placeId>` opens a card on load. Edit the folder's `map.ts`/`index.html` freely; `build` bundles them.
- Only route between road-accessible locations. For a hike, route to the trailhead; for a boat-only beach, route to its departure point. Route failures are logged in the browser console.

## Google Cloud

Key `trip-maps-local` in project `trip-maps-512505` (account plarza@plarza.com; manage with `gcloud services api-keys`). On 23 October 2026 the user approved removing its website restrictions so files opened from disk work. It is restricted to four APIs: `maps-backend` (Maps JavaScript), `places`, `placewidgets` (Places UI Kit; without it the card fails with 403 on `GetPlaceWidget`) and `routes`. The key is visible in the built HTML, so don't commit or publish built maps. An AUD 1 budget alert is set.

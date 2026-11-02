---
name: travel
description: Trip and holiday research. Google Flights date grids and itineraries, hotel, villa and home search across Google Hotels, Airbnb, Agoda and cozycozy, Google Maps place search and nearby search (cafes, food, markets, sights), and a satellite trip map delivered as one HTML file: a Google Maps-style day-by-day timeline of countries, flights and stays, AI options to pick from, and Google place cards. Use for any flight, hotel, destination, itinerary or "where should we go" question.
---

Resolve this skill's real directory through symlinks. The repository root is two directories above it. Run commands from the root; they print JSON. `bun run travel help` lists every command and flag.

## Holiday workflow

1. **Shortlist destinations** that meet every hard requirement: weather for the dates, visas for the travellers' passports, vibe and transport limits. Only propose options that meet all of them.
2. **Flights:** for a date range, run one `flights grid` over the whole range with every candidate destination, never a sampled date pair:
   `flights grid --origin SYD --destination HKT,KBV,LGK --start 2026-12-01 --return-by 2026-12-31 --min-days 6 --max-days 8 --adults 2 --max-stops one-or-fewer-stops`
   Then get itineraries for the chosen dates, outbound plus the return of the cheapest outbound:
   `flights search --origin SYD --destination LGK,KBV --departure 2026-12-01 --return 2026-12-09 --adults 2 --select cheapest`
3. **Hotels:** one search covers Google Hotels, Airbnb, Agoda and cozycozy, one row per listing per site, priced for the whole stay:
   `hotels search --location "Langkawi, Malaysia" --check-in 2026-12-02 --check-out 2026-12-09 --entire --pool --min-rating 4.5`
   Then read the shortlist's beds, room types and pool (private or shared) with `hotels details --url <row url>` before recommending anything.
4. **Around the hotel:** `places nearby --lat … --lng … --types cafe,restaurant` (or `market`, `tourist_attraction`, `hiking_area`, `beach`) ranks places by popularity with distance in km.
5. **Map:** always deliver the map as one HTML file that opens from disk:
   `map init <folder>`, write `<folder>/trip.json`, then `map build <folder> --title "…"` writes `<folder>/map.html`. The left panel is the whole trip as a day-by-day timeline (countries, places, flights, stays, activities), and the right panel holds only Google's place card. Keep the template's Google Maps styling.

## Planning around an existing itinerary

When the user brings a plan (spreadsheet, doc, notes):

1. **Import it as planned.** Each row becomes a day; transport, stays and activities become items. Read booking state from the source (for example cell fills against a key) into `booking: "booked" | "to book"`. Keep the user's wording.
2. **Ask before researching**, in one round: who is travelling (ages, fitness), interests to lean towards, pace, budget, and how bold to be: swap activities only, or also move nights and unbooked transport. Note anything obvious as an assumption instead of asking.
3. **Research every day** with `places search` and `places nearby` around that day's base. Check opening days and seasonal closures for the actual dates.
4. **Offer options; don't decide.** Give each full day about 6–10 AI options, one place per card. Mark alternatives to unbooked items with `replaces`, and options where only one can happen with a shared `choice` label. The user picks with the + button; nothing changes the plan until then. Never touch booked items. Flag real problems in the plan (tight connections, wrong airports, closures) as options too.

Report prices with the date they were fetched; they change daily. Commands exit non-zero on HTTP/RPC failures: those are errors, not empty results.

References, read when using that area: [flights](references/flights.md) · [hotels](references/hotels.md) · [places](references/places.md) · [map](references/map.md)

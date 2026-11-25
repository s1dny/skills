---
name: eatclub
description: Query EatClub restaurant API data for NSW venues, menus, recurring deals, walking distances and today's live deal availability.
---

Resolve the skill directory through symlinks and run commands from the repository root two directories above it.

## Commands

```sh
bun run eatclub help
bun run eatclub sql "SELECT name, slug FROM venues LIMIT 5"
bun run eatclub walk -33.8688 151.2093 --max 10
bun run eatclub live bar-bruno
```

Commands return JSON data except for `help`. The read-only `sql` command also accepts SQL on stdin. Inspect columns with `PRAGMA table_info(table_name)`.

## Finding venues and deals

- Use the supplied coordinates or geocode the named place. The `walk` command replaces `walk_times` for that origin. It estimates walking time on OpenStreetMap paths at 4.8 km/h, excluding waits at crossings.
- For today, run `live` with the shortlisted venue slugs. Check `live_deals.date`, `fetched_at`, `qty_left` (0 means sold out), and the offer terms. This table can include one-off deals absent from the weekly schedule. If the refresh fails or returns no rows, check the current EatClub venue listing and label app availability as unverified. A failed refresh preserves previously cached live rows.
- Use `deals` for weekly schedules and `hours` to check opening and kitchen hours, including split shifts. Check the deal type, menu availability, and `discount_exclusions` before calculating a discounted price. Add any mandatory menu charges.
- Use the venue's local timezone. SQL schedule times are minutes after midnight and `day` uses ISO weekdays (Monday = 1). Get Sydney's current weekday and time with `TZ=Australia/Sydney date '+%u %H:%M'`. **Use 24-hour time in user-facing answers**, including offer windows such as `17:00–18:30`.
- Use `venues.app_link` to open a venue in the app and `venues.url` for the public listing.

## Schema

Join venue tables on `slug`. Use `json_extract` and `json_each` for JSON fields.

| Table | Fields and behavior |
| --- | --- |
| `venues` | Names, addresses, coordinates, ratings, links, and raw `web_json` and `app_json`. `max_discount_pct` is the venue's best offer, regardless of the requested time. App-only fields can be NULL. |
| `venue_cuisines` | One row per venue and cuisine tag. |
| `walk_times` | `minutes` and `meters` for the last walk origin. |
| `hours` | One row per shift. `close_min` can exceed 1440 for overnight hours. `kitchen_close_min` can be NULL. |
| `deals` | Offers have `day`, `start_min`, `end_min`, `discount_pct` and `type` (`dinein` or `takeaway`). All-day offers are expanded to opening shifts, so `deal_id` can repeat. |
| `live_deals` | Today's offer windows, quantities, party limits, flags, and terms. A window of 0–1440 means all day during opening hours. |
| `discount_exclusions` | Offer exclusions by venue and date. `items` is JSON. |
| `menu_items` | Dish names, descriptions, prices in AUD, and `menu_type` (`dinein`, `takeaway`, or `all`). NULL menu times mean all day. `no_discount = 1` marks an excluded dish. `options` lists required choices and add-on prices. |
| `reviews` | Recent diner reviews. |
| `meta` | Cache timestamps and the last walk origin. Read `synced_at` for menu and schedule freshness. |

Search titles, descriptions, and categories with `menu_fts`. For example, after running `walk`:

```sh
bun run eatclub sql "
SELECT DISTINCT m.slug, w.minutes, m.title, m.price, m.menu_type
FROM menu_fts f JOIN menu_items m ON m.id = f.rowid
JOIN walk_times w ON w.slug = m.slug
WHERE menu_fts MATCH 'beef OR lamb' AND m.no_discount = 0
ORDER BY w.minutes"
```

## Data setup

- `bun run eatclub sync` rebuilds the local database. Defaults are `data/eatclub.db` and NSW. Override them with `EATCLUB_DB` and the comma-separated `EATCLUB_STATES`.
- App data requires `EATCLUB_APP_API_KEY` in `.env`. The Android app (`dinnerdeal.android.customer`) ships its public key in `res/ju.json` under `AppSync.Default.ApiKey`.
- `bun run eatclub map [path/to/extract.osm.pbf]` builds `data/walk-graph.bin`. The default input is `data/osm/australia-latest.osm.pbf` from [Geofabrik](https://download.geofabrik.de/australia-oceania.html). The default bounding box covers Newcastle, Sydney, and Wollongong. Override it with `EATCLUB_MAP_BBOX` in south, west, north, east order.

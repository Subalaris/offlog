# OffLog

A private travel planner for trips, flights, stays, activities, documents, budgets, and travel history.

## Stack

- Next.js 15 App Router and Server Actions
- React 19, TypeScript, Tailwind CSS 4
- Supabase Auth with email one-time codes
- Supabase Postgres with Row Level Security
- Private Supabase Storage for travel documents

## Local setup

1. Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable key.
2. Run the SQL files in `supabase/migrations/` in filename order in the Supabase SQL Editor.
3. In Supabase Auth, enable email sign-in and configure the email template to include `{{ .Token }}`.
4. Allow `http://localhost:3000/**` in the Supabase redirect URL settings.
5. Install and start the app:

```bash
npm install
npm run dev
```

Development output goes to `.next-dev`; production builds and `npm start` use `.next`.
This keeps production build checks from overwriting the running development server's files.

## Production

Set these environment variables in the hosting provider:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL
BIGDATACLOUD_API_KEY
```

`BIGDATACLOUD_API_KEY` is server-only. Create it in BigDataCloud under Account → Credentials and
enable the Reverse Geocoding package. Never prefix it with `NEXT_PUBLIC_`.

Use the exact production URL as the Supabase Site URL and add it to the allowed redirect URLs.

## Database changes

Keep schema changes in `supabase/migrations/`. Apply pending migrations to Supabase before deploying application code that depends on them.

## Flight connections

Flight bookings support up to ten legs under one booking, confirmation code, and cost. Use
**Add connection** in the booking form, enter the connecting airport, and add departure and
arrival dates/times for each leg. Times are local to each airport; arrival dates can differ from
departure dates. Flight numbers and seats can be entered per leg. Existing single-flight bookings
remain editable, and the itinerary shows all legs together on the first departure day.

Apply `supabase/migrations/20261001000000_flight_connections.sql` before deploying this feature.
Local development also uses the Supabase project configured in `.env.local`; starting Next.js does
not apply database migrations. Run the SQL file in that project's Supabase SQL Editor, then retry
saving the booking. The migration can be rerun and requests an API schema-cache refresh.

## Travel history imports

The Travel History page accepts current Google Timeline JSON exports, older Takeout Timeline JSON,
simple JSON visit arrays, Google Photos Takeout ZIPs, extracted Takeout folders, and original photos.
Select all ZIP parts of an export together, or drop ZIPs, photos, or metadata JSON onto the Photos
import area. ZIP entries are read locally on demand without extracting the entire archive into memory.
Photos imports use Google's
sidecar metadata first and fall back to GPS and capture dates embedded in the original image files.
Nearby photos taken within a few days are grouped into possible visits.

Parsing happens in the browser; original location-history files and photos are not uploaded or
retained. Imported rows must have a reviewed city, country, arrival date, and departure date before
they can be saved. Metadata files larger than 5 MB and photos larger than 100 MB are skipped.

When `BIGDATACLOUD_API_KEY` is configured, the importer can group nearby coordinates and resolve
them to city and country automatically through BigDataCloud before review. If lookup is unavailable,
visits remain available for manual editing and lookup can be retried. Only representative coordinates are
sent to the geocoding provider; the original Timeline or Photos files remain in the browser.

Use **Scan duplicates** on Travel History to review visits with matching city, country, arrival,
and departure dates, including matches across import sources. The review suggests keeping
trip-linked visits first, then manually entered visits, then the oldest imported copy. You can choose
a different copy to keep or skip a group. Cleanup rechecks the matches before removing up to
500 selected duplicate copies at a time. Trips and bookings are retained; visits with different
date ranges are not treated as duplicates.

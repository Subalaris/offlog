# OffLog

A private travel planner for trips, flights, stays, activities, documents, budgets, and travel history.

## Stack

- Next.js 15 App Router and Server Actions
- React 19, TypeScript, Tailwind CSS 4
- Supabase Auth with email sign-in links or one-time codes
- Supabase Postgres with Row Level Security
- Private Supabase Storage for travel documents

## Local setup

1. Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable key.
2. Run the SQL files in `supabase/migrations/` in filename order in the Supabase SQL Editor.
3. In Supabase Auth, enable email sign-in. The default sign-in-link template is supported;
   optionally include `{{ .Token }}` in the email to allow code entry as well.
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
Allow `https://YOUR_PRODUCTION_HOST/auth/callback**` and `http://localhost:3000/auth/callback**`
under Supabase Authentication → URL Configuration → Redirect URLs. OffLog sends each sign-in
email back to the origin where sign-in started, finishes authentication at `/auth/callback`, and
returns the user to the requested page. Default templates that return a code to the site root
are also routed through the callback automatically.

For links that also work when opened in a different browser/device, configure the Magic Link
and Confirm Signup email templates to verify a token hash at the callback:

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">Sign in to OffLog</a>
```

OffLog's `RedirectTo` includes the `next` query parameter. This optional template uses direct
token verification; the default template uses PKCE and should be opened in the browser where
sign-in started. Expired or already used links return a clear error with an option to request
a new email.

## User profiles

Open **Profile** in the sidebar or select the account avatar to edit your display name,
home city/country, and default currency. Currency applies to newly created trips only.
These preferences are saved in Supabase Auth user metadata; no database migration is needed.
Profile pictures support JPEG, PNG, and WebP (up to 10 MB before processing). The browser creates
a 512-pixel square preview and uploads the resized picture after **Save photo**. Pictures use the
existing private `trip-documents` bucket under `<user-id>/profile/`, with its existing owner-only
policies. The authenticated photo endpoint serves only the current user's picture. Replacing or
removing a picture also attempts to delete the old file. No additional migration is needed.
Email changes are handled separately through Supabase Auth and require any confirmations
configured for the project (normally both the current and new inboxes). Default email-change
templates can return to `/auth/callback?next=/profile`; custom token-hash templates must use
`type=email_change` for this flow.

## Database changes

Keep schema changes in `supabase/migrations/`. Apply pending migrations to Supabase before deploying application code that depends on them.

## Trip PDF exports

Open a trip and choose **Export trip** to preview a clean itinerary with flights and connections,
stays, transfers, and activities. Costs and budget, confirmation codes, and trip/booking notes
are optional and off by default. Documents are excluded. Choose **Print / Save as PDF**, then
select your browser's PDF destination. Turn off print headers and footers for a clean export.
The saved PDF is a snapshot; export again after editing the trip. The preview requires sign-in
and uses the trip's existing owner-only access. No database migration is needed.

## Flight connections

Flight bookings support up to ten legs under one booking, confirmation code, and cost. Use
**Add connection** in the booking form, enter the connecting airport, and add departure and
arrival dates/times for each leg. Times are local to each airport; arrival dates can differ from
departure dates. Flight numbers and seats can be entered per leg. Existing single-flight bookings
remain editable. Each leg appears on its departure day, with a separate arrival entry when
the arrival date differs from departure.

Apply `supabase/migrations/20261001000000_flight_connections.sql` before deploying this feature.
Local development also uses the Supabase project configured in `.env.local`; starting Next.js does
not apply database migrations. Run the SQL file in that project's Supabase SQL Editor, then retry
saving the booking. The migration can be rerun and requests an API schema-cache refresh.

## Stay times and itinerary ordering

Stay bookings have editable check-in and check-out times, defaulting to **15:00** and **11:00**
in hotel local time. Existing stays without times use those defaults in the itinerary. Check-in
uses the existing `time` field; check-out uses the new `checkout_time` field.

Apply `supabase/migrations/20261018000000_stay_checkout_time.sql` in your project's Supabase SQL
Editor before saving stays with this version. The migration is safe to rerun and refreshes the API schema cache.

The trip page and PDF export share one event order: timed events are chronological within each
local date, with untimed plans afterward. Stays show separate check-in/check-out entries and
accommodation context on intervening trip days. Overnight flights show their arrival on the
arrival date. Repeated events share one booking; cost appears only on its first event.
Flight times remain local to each airport; ordering does not convert between time zones.

## Travel history imports

Travel History’s **Map** tab shows one marker per place, with dates and links to associated trips.
Visited places are cyan, future places are purple, and places with both past and future visits have
a cyan center with a purple border. Visits arriving today count as visited. Coordinates already
imported from Timeline or Photos are reused.
For places without coordinates, choose a city match from the bundled `all-the-cities` / GeoNames
dataset, review the pin, and save it. Ambiguous matches require choosing a candidate; unmatched
places can be pinned manually or given latitude/longitude. Coordinates are saved on the existing
place record, so no additional migration or geocoding API key is needed. The city database stays
on the server and makes no external geocoding requests. It is a snapshot and does not cover every
small settlement or alternative name. GeoNames data is credited in the map’s usage details under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

OpenStreetMap imagery loads only when the Map tab is open, only for the current viewport, with
browser caching and no offline/prefetch features. The map limits zoom to city scale and pauses
downloads after repeated imagery errors. A conservative local allowance warns at 240 and stops
at 300 tile attempts per browser per UTC day, including cache hits. The counter is persisted in
localStorage; if storage is blocked it is limited to the current map session. This is an Offlog
precaution, **not an OSM quota**: counters are separate across browsers and concurrent tabs can
race. It cannot guarantee compliance at high application-wide traffic. OSM publishes no fixed
free request quota and can block heavy usage without notice; review the
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/) before scaling. There is
no paid fallback or billing integration. For larger usage, replace the tile provider and add a
shared application-wide allowance appropriate to its terms.

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

Booking forms include **Fill from document or text**. Paste labeled confirmation text, choose a
text-based PDF or `.txt` file, or select a PDF already uploaded to the trip. Import fills a draft;
review it and select **Save booking** to persist it. Recognized fields replace corresponding values,
while other manual edits remain. Numbered `Flight 1:`, `Flight 2:` sections import connections.
Dates accept `YYYY-MM-DD`, `10 November 2026`, or `November 10, 2026`; ambiguous numeric dates
are left blank. Totals in a different currency are flagged rather than converted. The rule-based parser supports KLM email schedules, Airbnb confirmation layouts, and labeled
booking details. Airbnb dates without a year are filled only when one matching date falls within
the selected trip, with a warning to confirm the year. Other layouts may need manual entry.

Booking imports are processed on the authenticated application server without an external AI
service. Import files are read temporarily and are not added to the trip's document storage;
upload them separately under Documents if you want to keep them. Files are limited to 10 MB,
PDF extraction to the first 20 pages, and extracted/pasted text to 100,000 characters. Images,
scanned PDFs, and password-protected PDFs require copying their text into the paste field.

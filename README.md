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

## Travel history imports

The Travel History page accepts current Google Timeline JSON exports, older Takeout Timeline JSON,
and simple JSON visit arrays. Parsing happens in the browser; the original location-history file is
not uploaded or retained. Imported rows must have a reviewed city, country, arrival date, and
departure date before they can be saved.

When `BIGDATACLOUD_API_KEY` is configured, the importer can group nearby coordinates and resolve
them to city and country through BigDataCloud before review. Only representative coordinates are
sent to the geocoding provider; the original Timeline file remains in the browser.

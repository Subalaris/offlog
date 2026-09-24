# OffLog

A private travel planner for trips, flights, stays, activities, documents, and budgets.

## Stack

- Next.js 15 App Router and Server Actions
- React 19, TypeScript, Tailwind CSS 4
- Supabase Auth with email one-time codes
- Supabase Postgres with Row Level Security
- Private Supabase Storage for travel documents

## Local setup

1. Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable key.
2. Run `supabase/migrations/20260923000000_initial_schema.sql` in the Supabase SQL Editor.
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
```

Use the exact production URL as the Supabase Site URL and add it to the allowed redirect URLs.

## Database changes

Keep schema changes in `supabase/migrations/`. Apply pending migrations to Supabase before deploying application code that depends on them.

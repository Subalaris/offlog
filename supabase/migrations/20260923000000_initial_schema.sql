create table public.trips (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  destination text not null default '',
  start_date date not null,
  end_date date not null,
  budget numeric(12, 2),
  currency text not null default 'USD' check (char_length(currency) = 3),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint trips_date_order check (end_date >= start_date)
);

create table public.bookings (
  id text primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  type text not null check (type in ('flight', 'stay', 'transfer', 'activity')),
  title text not null default '',
  date date,
  time time,
  ends_at date,
  provider text not null default '',
  reference text not null default '',
  seat text not null default '',
  from_place text not null default '',
  to_place text not null default '',
  cost numeric(12, 2),
  currency text not null default 'USD' check (char_length(currency) = 3),
  status text not null default 'booked' check (status in ('booked', 'pending', 'done')),
  notes text not null default ''
);

create table public.documents (
  id text primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  label text not null,
  filename text not null,
  storage_path text not null unique,
  size bigint not null check (size between 1 and 10485760),
  kind text not null,
  mime text not null,
  created_at timestamptz not null default now(),
  unique (trip_id, filename)
);

create index trips_owner_start_idx on public.trips(owner_id, start_date);
create index bookings_trip_date_idx on public.bookings(trip_id, date, time);
create index documents_trip_created_idx on public.documents(trip_id, created_at desc);

alter table public.trips enable row level security;
alter table public.bookings enable row level security;
alter table public.documents enable row level security;

revoke all on public.trips, public.bookings, public.documents from anon;
grant select, insert, update, delete on public.trips, public.bookings, public.documents to authenticated;

create policy "Users can read their trips"
on public.trips for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can create their trips"
on public.trips for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Users can update their trips"
on public.trips for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Users can delete their trips"
on public.trips for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can read bookings in their trips"
on public.bookings for select to authenticated
using (exists (
  select 1 from public.trips
  where trips.id = bookings.trip_id and trips.owner_id = (select auth.uid())
));

create policy "Users can create bookings in their trips"
on public.bookings for insert to authenticated
with check (exists (
  select 1 from public.trips
  where trips.id = bookings.trip_id and trips.owner_id = (select auth.uid())
));

create policy "Users can update bookings in their trips"
on public.bookings for update to authenticated
using (exists (
  select 1 from public.trips
  where trips.id = bookings.trip_id and trips.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.trips
  where trips.id = bookings.trip_id and trips.owner_id = (select auth.uid())
));

create policy "Users can delete bookings in their trips"
on public.bookings for delete to authenticated
using (exists (
  select 1 from public.trips
  where trips.id = bookings.trip_id and trips.owner_id = (select auth.uid())
));

create policy "Users can read documents in their trips"
on public.documents for select to authenticated
using (exists (
  select 1 from public.trips
  where trips.id = documents.trip_id and trips.owner_id = (select auth.uid())
));

create policy "Users can create documents in their trips"
on public.documents for insert to authenticated
with check (exists (
  select 1 from public.trips
  where trips.id = documents.trip_id and trips.owner_id = (select auth.uid())
));

create policy "Users can delete documents in their trips"
on public.documents for delete to authenticated
using (exists (
  select 1 from public.trips
  where trips.id = documents.trip_id and trips.owner_id = (select auth.uid())
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-documents',
  'trip-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their trip files"
on storage.objects for select to authenticated
using (
  bucket_id = 'trip-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can upload their trip files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'trip-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update their trip files"
on storage.objects for update to authenticated
using (
  bucket_id = 'trip-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'trip-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their trip files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'trip-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

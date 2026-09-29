create table public.places (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  city text not null check (char_length(city) between 1 and 160),
  country text not null check (char_length(country) between 1 and 160),
  country_code text check (country_code is null or char_length(country_code) = 2),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  normalized_key text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, normalized_key)
);

create table public.visits (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null references public.places(id) on delete cascade,
  trip_id text references public.trips(id) on delete set null,
  start_date date not null,
  end_date date not null,
  source text not null default 'manual' check (source in ('manual', 'trip', 'google_timeline')),
  external_id text,
  created_at timestamptz not null default now(),
  constraint visits_date_order check (end_date >= start_date)
);

create index places_owner_country_idx on public.places(owner_id, country, city);
create index visits_owner_date_idx on public.visits(owner_id, start_date desc, end_date desc);
create index visits_place_idx on public.visits(place_id);
create unique index visits_owner_source_external_idx
  on public.visits(owner_id, source, external_id)
  where external_id is not null;

alter table public.places enable row level security;
alter table public.visits enable row level security;

revoke all on public.places, public.visits from anon;
grant select, insert, update, delete on public.places, public.visits to authenticated;

create policy "Users can read their places"
on public.places for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can create their places"
on public.places for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Users can update their places"
on public.places for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Users can delete their places"
on public.places for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can read their visits"
on public.visits for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can create their visits"
on public.visits for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.places
    where places.id = visits.place_id and places.owner_id = (select auth.uid())
  )
  and (
    trip_id is null or exists (
      select 1 from public.trips
      where trips.id = visits.trip_id and trips.owner_id = (select auth.uid())
    )
  )
);

create policy "Users can update their visits"
on public.visits for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.places
    where places.id = visits.place_id and places.owner_id = (select auth.uid())
  )
  and (
    trip_id is null or exists (
      select 1 from public.trips
      where trips.id = visits.trip_id and trips.owner_id = (select auth.uid())
    )
  )
);

create policy "Users can delete their visits"
on public.visits for delete to authenticated
using ((select auth.uid()) = owner_id);

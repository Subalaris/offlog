-- Private, revocable subscription links. No Google credentials or service-role key required.
create table if not exists public.calendar_subscriptions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique check (token ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);

alter table public.calendar_subscriptions enable row level security;
revoke all on public.calendar_subscriptions from anon;
grant select, insert, update, delete on public.calendar_subscriptions to authenticated;
drop policy if exists "Owners manage their calendar subscription" on public.calendar_subscriptions;
create policy "Owners manage their calendar subscription"
  on public.calendar_subscriptions for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Stable modification dates allow subscribers to update existing calendar entries.
alter table public.bookings add column if not exists updated_at timestamptz not null default now();
alter table public.trips add column if not exists updated_at timestamptz not null default now();
create or replace function public.touch_calendar_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.touch_calendar_updated_at() from public;
drop trigger if exists bookings_calendar_updated_at on public.bookings;
create trigger bookings_calendar_updated_at before update on public.bookings
  for each row execute function public.touch_calendar_updated_at();
drop trigger if exists trips_calendar_updated_at on public.trips;
create trigger trips_calendar_updated_at before update on public.trips
  for each row execute function public.touch_calendar_updated_at();
drop trigger if exists subscription_calendar_updated_at on public.calendar_subscriptions;
create trigger subscription_calendar_updated_at before update on public.calendar_subscriptions
  for each row execute function public.touch_calendar_updated_at();

-- This is the ONLY anonymous access path. An unguessable token selects one owner's
-- itinerary. Return an explicit allowlist, never booking records or auth metadata.
create or replace function public.read_offlog_calendar(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'updated_at', subscription.updated_at,
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', trip.id, 'name', trip.name, 'destination', trip.destination,
        'updated_at', trip.updated_at,
        'bookings', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', booking.id, 'type', booking.type, 'title', booking.title,
            'date', booking.date, 'time', booking.time,
            'ends_at', booking.ends_at, 'checkout_time', booking.checkout_time,
            'provider', booking.provider, 'from_place', booking.from_place,
            'to_place', booking.to_place, 'status', booking.status,
            'updated_at', booking.updated_at,
            'flight_legs', coalesce((
              select jsonb_agg(jsonb_build_object(
                'from_place', leg ->> 'from_place', 'to_place', leg ->> 'to_place',
                'departure_date', leg ->> 'departure_date', 'departure_time', leg ->> 'departure_time',
                'arrival_date', leg ->> 'arrival_date', 'arrival_time', leg ->> 'arrival_time',
                'flight_number', leg ->> 'flight_number'
              ) order by position)
              from jsonb_array_elements(booking.flight_legs) with ordinality as legs(leg, position)
            ), '[]'::jsonb)
          ) order by booking.id)
          from public.bookings as booking where booking.trip_id = trip.id
        ), '[]'::jsonb)
      ) order by trip.id)
      from public.trips as trip where trip.owner_id = subscription.owner_id
    ), '[]'::jsonb)
  )
  from public.calendar_subscriptions as subscription
  where subscription.token = p_token;
$$;
revoke all on function public.read_offlog_calendar(text) from public;
grant execute on function public.read_offlog_calendar(text) to anon, authenticated;

notify pgrst, 'reload schema';

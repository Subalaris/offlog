alter table public.bookings
  add column if not exists flight_legs jsonb not null default '[]'::jsonb
  check (jsonb_typeof(flight_legs) = 'array' and jsonb_array_length(flight_legs) <= 10);

comment on column public.bookings.flight_legs is
  'Ordered flight legs. Departure and arrival dates/times are local to each airport.';

notify pgrst, 'reload schema';

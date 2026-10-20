alter table public.bookings
  add column if not exists checkout_time time default '11:00';

comment on column public.bookings.checkout_time is
  'Stay check-out time in hotel local time. Stay check-in uses the existing time column; missing check-in times display as 15:00.';

notify pgrst, 'reload schema';

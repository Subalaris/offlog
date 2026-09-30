alter table public.visits
  drop constraint if exists visits_source_check;

alter table public.visits
  add constraint visits_source_check
  check (source in ('manual', 'trip', 'google_timeline', 'google_photos'));

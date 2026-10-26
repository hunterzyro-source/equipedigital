create schema if not exists equipe_digital_private;

create table if not exists equipe_digital_private.app_state (
  id smallint primary key default 1 check (id = 1),
  state jsonb not null,
  updated_at timestamptz not null default now()
);


alter table equipe_digital_private.app_state enable row level security;
alter table equipe_digital_private.app_state force row level security;
revoke all on schema equipe_digital_private from public, anon, authenticated;
revoke all on table equipe_digital_private.app_state from public, anon, authenticated;

comment on table equipe_digital_private.app_state is
  'Private server-side state for Equipe Digital; never exposed through the Supabase Data API.';

create table if not exists equipe_digital_private.avatars (
  path text primary key,
  content bytea not null,
  updated_at timestamptz not null default now()
);

alter table equipe_digital_private.avatars enable row level security;
alter table equipe_digital_private.avatars force row level security;
revoke all on table equipe_digital_private.avatars from public, anon, authenticated;

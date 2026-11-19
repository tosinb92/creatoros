create table public.creatoros_link_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  source_url text not null,
  provider_id text,
  state text not null default 'submitting' check (state in ('submitting','processing','review')),
  created_at timestamptz not null default now(),
  unique (owner_id, source_key)
);
alter table public.creatoros_link_imports enable row level security;
revoke all on table public.creatoros_link_imports from public, anon, authenticated;
grant select, insert, update on table public.creatoros_link_imports to service_role;

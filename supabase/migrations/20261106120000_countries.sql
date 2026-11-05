-- travel GO: the countries an account has been to ("다녀온 나라"), the same on each of its devices.
-- Run after 20261105200000_sharing.sql: paste into the Supabase SQL Editor and run. Running it
-- again changes nothing.
--
--   select from public.visited_countries      the signed-in account's countries
--   public.save_visited_countries(changes)    writes them; per country, the later `updatedAt` wins
--
-- A country taken off the list stays as a row with `visited = false`, so other devices hear of it.

create table if not exists public.visited_countries (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- ISO 3166-1 alpha-2 (`JP`); XK for Kosovo.
  code text not null check (code ~ '^[A-Z]{2}$'),
  visited boolean not null,
  updated_at timestamptz not null,
  primary key (user_id, code)
);

alter table public.visited_countries enable row level security;

drop policy if exists "Accounts see their countries" on public.visited_countries;
create policy "Accounts see their countries" on public.visited_countries
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Reading only: writes go through save_visited_countries.
revoke all on table public.visited_countries from public, anon, authenticated;
grant select on table public.visited_countries to authenticated;

-- Each change is { code, visited, updatedAt }: { status: 'ok' }.
create or replace function public.save_visited_countries(changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := private.require_session();
begin
  insert into public.visited_countries as v (user_id, code, visited, updated_at)
  select distinct on (c.code) me, c.code, c.visited, c."updatedAt"
  from jsonb_to_recordset(changes) as c(code text, visited boolean, "updatedAt" timestamptz)
  order by c.code, c."updatedAt" desc
  on conflict (user_id, code) do update
    set visited = excluded.visited, updated_at = excluded.updated_at
    where excluded.updated_at > v.updated_at;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.save_visited_countries(jsonb) from public, anon, authenticated;
grant execute on function public.save_visited_countries(jsonb) to authenticated;

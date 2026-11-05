-- travel GO, step 18: friends join a trip through an invite link, then read and change it like its
-- owner. Run after 20261105120000_sync.sql: paste into the Supabase SQL Editor and run. Running it
-- again changes nothing.
--
--   public.create_invite(trip) / current_invite(trip) / revoke_invite(trip)  the owner's link
--   public.invite_preview(token)  what a link is for, before signing in
--   public.join_trip(token)       the signed-in account becomes a member
--   public.trip_people(trip)      who is in a trip, with the name and photo of their login
--   public.leave_trip(trip)       a member leaves (the owner deletes the trip instead)
--   public.remove_member(trip, user)  the owner takes a member out
--
-- Members write the trip's records through sync_push like its owner, which keeps deleting the trip
-- to the owner. Answers are { status, ... }; only a call without a session is an error.

-- A trip's invite link: whoever signs in through it before `expires_at` joins. One per trip; the
-- owner can cut it (deleted) and make another.
create table if not exists public.invites (
  token text primary key,
  trip_id uuid not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.invites enable row level security;
-- Only through the functions below.
revoke all on table public.invites from public, anon, authenticated;

-- 22 characters of a random UUID (122 random bits), safe in an address.
create or replace function private.new_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(uuid_send(gen_random_uuid()), 'base64'), '='), '+/', '-_')
$$;

-- A person's name and photo as their login filled them in, like the app's toAccount(): Kakao's
-- nickname or Google's name; photos over https.
create or replace function private.person_name(meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(meta ->> 'full_name'), ''),
    nullif(btrim(meta ->> 'name'), ''),
    nullif(btrim(meta ->> 'preferred_username'), '')
  )
$$;

create or replace function private.person_photo(meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when url like 'https://%' then url
    when url like 'http://%' then 'https://' || substr(url, 8)
  end
  from (
    select coalesce(nullif(btrim(meta ->> 'avatar_url'), ''), nullif(btrim(meta ->> 'picture'), '')) as url
  ) photo
$$;

-- Whether the signed-in account may manage `trip`'s invites: 'ok', or why not ('no_trip': not on
-- the server yet, 'gone': deleted, 'forbidden': not its owner).
create or replace function private.owner_check(trip uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when r.id is null then 'no_trip'
    when r.deleted then 'gone'
    when not exists (
      select 1 from public.trip_members m
      where m.trip_id = trip and m.user_id = auth.uid() and m.role = 'owner'
    ) then 'forbidden'
    else 'ok'
  end
  from (select 1) one
  left join public.records r on r.id = trip and r.kind = 'trip'
$$;

create or replace function private.require_session()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- The trip's link, made now if it has none that still works: { status: 'ok', token, expiresAt }.
create or replace function public.create_invite(trip uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := private.require_session();
  check_status constant text := private.owner_check(trip);
  invite public.invites;
begin
  if check_status <> 'ok' then
    return jsonb_build_object('status', check_status);
  end if;
  select * into invite from public.invites i where i.trip_id = trip;
  if invite.token is null or invite.expires_at <= now() then
    delete from public.invites i where i.trip_id = trip;
    insert into public.invites (token, trip_id, created_by, expires_at)
    values (private.new_token(), trip, me, now() + interval '7 days')
    returning * into invite;
  end if;
  return jsonb_build_object('status', 'ok', 'token', invite.token, 'expiresAt', invite.expires_at);
end;
$$;

-- The trip's link if it still works: { status: 'ok', token, expiresAt }, or { status: 'none' }.
create or replace function public.current_invite(trip uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  check_status text;
  invite public.invites;
begin
  perform private.require_session();
  check_status := private.owner_check(trip);
  if check_status <> 'ok' then
    return jsonb_build_object('status', check_status);
  end if;
  select * into invite from public.invites i where i.trip_id = trip and i.expires_at > now();
  if invite.token is null then
    return jsonb_build_object('status', 'none');
  end if;
  return jsonb_build_object('status', 'ok', 'token', invite.token, 'expiresAt', invite.expires_at);
end;
$$;

-- Cuts the trip's link: nobody else joins through it.
create or replace function public.revoke_invite(trip uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  check_status text;
begin
  perform private.require_session();
  check_status := private.owner_check(trip);
  if check_status <> 'ok' then
    return jsonb_build_object('status', check_status);
  end if;
  delete from public.invites i where i.trip_id = trip;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- What a link is for, also before signing in: { status: 'ok', tripId, title, city, startDate,
-- endDate, inviter, expiresAt }, or { status: 'invalid' } (no such link, cut, expired, or its trip
-- was deleted).
create or replace function public.invite_preview(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'status', 'ok',
        'tripId', i.trip_id,
        'title', r.data ->> 'title',
        'city', r.data #>> '{city,name}',
        'startDate', r.data ->> 'startDate',
        'endDate', r.data ->> 'endDate',
        'inviter', private.person_name(u.raw_user_meta_data),
        'expiresAt', i.expires_at
      )
      from public.invites i
      join public.records r on r.id = i.trip_id and r.kind = 'trip' and not r.deleted
      left join auth.users u on u.id = i.created_by
      where i.token = invite_preview.token and i.expires_at > now()
    ),
    jsonb_build_object('status', 'invalid')
  )
$$;

-- Joins the trip of a working link: { status: 'joined' | 'member', tripId, role } ('member': was
-- in it already, as `role`), or { status: 'invalid' }.
create or replace function public.join_trip(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := private.require_session();
  invite public.invites;
  my_role text;
begin
  select i.* into invite
  from public.invites i
  join public.records r on r.id = i.trip_id and r.kind = 'trip' and not r.deleted
  where i.token = join_trip.token and i.expires_at > now();
  if invite.token is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select m.role into my_role from public.trip_members m
  where m.trip_id = invite.trip_id and m.user_id = me;
  if my_role is not null then
    return jsonb_build_object('status', 'member', 'tripId', invite.trip_id, 'role', my_role);
  end if;
  insert into public.trip_members (trip_id, user_id, role)
  values (invite.trip_id, me, 'member')
  on conflict (trip_id, user_id) do nothing;
  return jsonb_build_object('status', 'joined', 'tripId', invite.trip_id, 'role', 'member');
end;
$$;

-- Who is in the trip, the owner first: { status: 'ok', people: [{ userId, role, name, avatarUrl,
-- joinedAt }] }, or { status: 'forbidden' } for someone not in it.
create or replace function public.trip_people(trip uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me constant uuid := private.require_session();
begin
  if not exists (
    select 1 from public.trip_members m where m.trip_id = trip and m.user_id = me
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  return jsonb_build_object('status', 'ok', 'people', (
    select jsonb_agg(
      jsonb_build_object(
        'userId', m.user_id,
        'role', m.role,
        'name', private.person_name(u.raw_user_meta_data),
        'avatarUrl', private.person_photo(u.raw_user_meta_data),
        'joinedAt', m.created_at
      )
      order by m.role = 'owner' desc, m.created_at, m.user_id
    )
    from public.trip_members m
    left join auth.users u on u.id = m.user_id
    where m.trip_id = trip
  ));
end;
$$;

-- A member leaves the trip: { status: 'ok' }. Its owner can't ('forbidden'): it deletes the trip.
create or replace function public.leave_trip(trip uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := private.require_session();
begin
  if exists (
    select 1 from public.trip_members m
    where m.trip_id = trip and m.user_id = me and m.role = 'owner'
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  delete from public.trip_members m where m.trip_id = trip and m.user_id = me;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- The owner takes `member` out of the trip: { status: 'ok' }; it can't take itself out.
create or replace function public.remove_member(trip uuid, member uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := private.require_session();
  check_status constant text := private.owner_check(trip);
begin
  if check_status <> 'ok' then
    return jsonb_build_object('status', check_status);
  end if;
  if member = me then
    return jsonb_build_object('status', 'forbidden');
  end if;
  delete from public.trip_members m where m.trip_id = trip and m.user_id = member;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function
  private.new_token(),
  private.person_name(jsonb),
  private.person_photo(jsonb),
  private.owner_check(uuid),
  private.require_session(),
  public.create_invite(uuid),
  public.current_invite(uuid),
  public.revoke_invite(uuid),
  public.invite_preview(text),
  public.join_trip(text),
  public.trip_people(uuid),
  public.leave_trip(uuid),
  public.remove_member(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.create_invite(uuid),
  public.current_invite(uuid),
  public.revoke_invite(uuid),
  public.invite_preview(text),
  public.join_trip(text),
  public.trip_people(uuid),
  public.leave_trip(uuid),
  public.remove_member(uuid, uuid)
to authenticated;
grant execute on function public.invite_preview(text) to anon;

-- Devices hear right away when a trip they hold changes (Realtime's Postgres Changes, which only
-- tells each account about rows it may read). They then pull as usual.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    raise notice 'no supabase_realtime publication: devices will see changes on their next sync';
  elsif not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end;
$$;

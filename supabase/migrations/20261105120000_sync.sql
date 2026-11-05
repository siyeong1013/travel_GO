-- travel GO, step 17: the account's trips on the server, kept in step with its devices.
-- Paste into the Supabase SQL Editor and run. Running it again changes nothing.
--
-- Devices keep working on their own copy (IndexedDB) and sync through two calls:
--   * public.sync_push(changes): writes records. Per record, the later `updatedAt` wins.
--   * select from public.records where seq > n: what changed since a device last looked.
-- A record is the app's own JSON (an expense together with its shares) in the app's data format
-- `format` (BACKUP_SCHEMA_VERSION), so a model change needs no change here.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Who may read and change a trip. For now only the account that uploaded it (`owner`); the
-- friends it is shared with (step 18) will be `member`s.
create table if not exists public.trip_members (
  trip_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists trip_members_user_id_idx on public.trip_members (user_id);

-- Order of writes on the server.
create sequence if not exists public.sync_seq;

-- Every record of every trip. A deleted record stays as a row without data, so the deletion
-- reaches the other devices; a deleted trip keeps only its own row.
create table if not exists public.records (
  id uuid primary key,
  trip_id uuid not null,
  kind text not null check (kind in ('trip', 'scheduleItem', 'companion', 'expense', 'settlement')),
  data jsonb,
  format integer not null,
  -- The record's `updatedAt`, or when it was deleted.
  updated_at timestamptz not null,
  deleted boolean not null default false,
  -- Devices ask for the rows after the last `seq` they saw.
  seq bigint not null,
  updated_by uuid,
  check ((data is null) = deleted),
  check (kind <> 'trip' or id = trip_id)
);
create index if not exists records_trip_id_seq_idx on public.records (trip_id, seq);
create index if not exists records_seq_idx on public.records (seq);

alter table public.trip_members enable row level security;
alter table public.records enable row level security;

drop policy if exists "Members see their memberships" on public.trip_members;
create policy "Members see their memberships" on public.trip_members
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Members see their trips' records" on public.records;
create policy "Members see their trips' records" on public.records
  for select to authenticated
  using (
    exists (
      select 1 from public.trip_members m
      where m.trip_id = records.trip_id and m.user_id = (select auth.uid())
    )
  );

-- Reading only: every write goes through sync_push, which checks who is writing.
revoke all on table public.trip_members, public.records from public, anon, authenticated;
grant select on table public.trip_members, public.records to authenticated;
revoke all on sequence public.sync_seq from public, anon, authenticated;

-- Writes the signed-in account's changes. Each change is
--   { id, tripId, kind, format, updatedAt, deleted, data }
-- (data: the record, absent when deleted). Returns [{ id, status }] in the same order:
--   applied    written (or a deletion with nothing to delete)
--   stale      the server has this record at the same time or later, or in a newer format; it
--              comes back as `current` ({ data, format, updatedAt, deleted }) to keep instead
--   gone       its trip was deleted
--   no_trip    its trip isn't on the server yet
--   forbidden  not this account's trip, or a deletion of a trip it doesn't own
--   invalid    malformed
-- Deleting a trip always goes through: what was changed in it meanwhile goes with it.
create or replace function public.sync_push(changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := auth.uid();
  change jsonb;
  results jsonb := '[]'::jsonb;
  status text;
  c_id uuid;
  c_trip uuid;
  c_kind text;
  c_format integer;
  c_at timestamptz;
  c_deleted boolean;
  c_data jsonb;
  trip public.records;
  existing public.records;
  my_role text;
begin
  if me is null then
    raise exception 'sign in to sync' using errcode = '42501';
  end if;
  if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) > 500 then
    raise exception 'changes must be an array of at most 500 records' using errcode = '22023';
  end if;

  -- One push at a time, so `seq` follows commit order: a device that has read up to some `seq`
  -- never misses a write that commits later with a smaller number.
  perform pg_advisory_xact_lock(hashtext('travel-go:sync'));

  for change in select value from jsonb_array_elements(changes) loop
    status := null;
    c_id := null;
    begin
      c_id := (change ->> 'id')::uuid;
      c_trip := (change ->> 'tripId')::uuid;
      c_kind := change ->> 'kind';
      c_format := (change ->> 'format')::integer;
      c_at := (change ->> 'updatedAt')::timestamptz;
      c_deleted := coalesce((change ->> 'deleted')::boolean, false);
      c_data := case when c_deleted then null else change -> 'data' end;
      if c_id is null or c_trip is null or c_format is null or c_at is null
        or c_kind is null or c_kind not in ('trip', 'scheduleItem', 'companion', 'expense', 'settlement')
        or (c_kind = 'trip' and c_trip <> c_id) then
        raise exception 'malformed change';
      end if;
      if not c_deleted and (
        jsonb_typeof(c_data) is distinct from 'object'
        or (c_data ->> 'id')::uuid is distinct from c_id
        or (c_kind <> 'trip' and (c_data ->> 'tripId')::uuid is distinct from c_trip)
        or (c_data ->> 'updatedAt')::timestamptz is distinct from c_at
        or octet_length(c_data::text) > 4000000
      ) then
        raise exception 'malformed record';
      end if;
    exception when others then
      status := 'invalid';
    end;

    if status is null then
      select * into trip from public.records r where r.id = c_trip;
      select m.role into my_role from public.trip_members m
        where m.trip_id = c_trip and m.user_id = me;
      if trip.id is null then
        if c_kind <> 'trip' then
          status := 'no_trip';
        elsif not c_deleted then
          -- A new trip: the account that uploads it owns it.
          insert into public.trip_members (trip_id, user_id, role)
          values (c_trip, me, 'owner')
          on conflict (trip_id, user_id) do nothing;
        end if;
      elsif my_role is null then
        status := 'forbidden';
      elsif trip.deleted then
        status := 'gone';
      elsif c_kind = 'trip' and c_deleted and my_role <> 'owner' then
        status := 'forbidden';
      end if;
    end if;

    if status is null then
      select * into existing from public.records r where r.id = c_id;
      if existing.id is not null and (existing.trip_id <> c_trip or existing.kind <> c_kind) then
        status := 'invalid';
      elsif existing.id is not null and not (c_kind = 'trip' and c_deleted)
        and (existing.updated_at >= c_at or existing.format > c_format) then
        status := 'stale';
      elsif existing.id is null and c_deleted then
        -- Never uploaded: nothing to delete.
        status := 'applied';
      else
        if c_kind = 'trip' and c_deleted then
          -- A deleted trip takes everything in it along; its own row stays to say so.
          delete from public.records r where r.trip_id = c_trip and r.kind <> 'trip';
        end if;
        insert into public.records as r
          (id, trip_id, kind, data, format, updated_at, deleted, seq, updated_by)
        values
          (c_id, c_trip, c_kind, c_data, c_format, c_at, c_deleted, nextval('public.sync_seq'), me)
        on conflict (id) do update set
          data = excluded.data,
          format = excluded.format,
          updated_at = excluded.updated_at,
          deleted = excluded.deleted,
          seq = excluded.seq,
          updated_by = excluded.updated_by;
        status := 'applied';
      end if;
    end if;

    results := results || jsonb_build_array(
      jsonb_build_object('id', coalesce(to_jsonb(c_id), change -> 'id'), 'status', status)
      || case when status = 'stale' then jsonb_build_object('current', jsonb_build_object(
        'data', existing.data,
        'format', existing.format,
        'updatedAt', existing.updated_at,
        'deleted', existing.deleted
      )) else '{}'::jsonb end
    );
  end loop;
  return results;
end;
$$;

revoke all on function public.sync_push(jsonb) from public, anon, authenticated;
grant execute on function public.sync_push(jsonb) to authenticated;

-- Google's terms allow keeping a place's coordinates for 30 days (the app treats the address the
-- same): the server's copy loses them then too, like the devices' (data/rules/placeData.ts).
-- Not a change to the record (`updatedAt` and `seq` stay): devices drop the data on their own.
create or replace function private.expire_place_data()
returns void
language sql
set search_path = ''
as $$
  update public.records
  set data = jsonb_set(
    jsonb_set(jsonb_set(data, '{place,address}', 'null'), '{place,location}', 'null'),
    '{place,fetchedAt}', 'null'
  )
  where kind = 'scheduleItem' and not deleted
    and data #>> '{place,fetchedAt}' is not null
    and (data #>> '{place,fetchedAt}')::timestamptz <= now() - interval '30 days';

  update public.records
  set data = jsonb_set(jsonb_set(data, '{city,location}', 'null'), '{city,fetchedAt}', 'null')
  where kind = 'trip' and not deleted
    and data #>> '{city,fetchedAt}' is not null
    and (data #>> '{city,fetchedAt}')::timestamptz <= now() - interval '30 days';
$$;

revoke all on function private.expire_place_data() from public, anon, authenticated;

-- Every day at 03:17 in Korea (18:17 UTC).
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule(
      'travel-go-expire-place-data', '17 18 * * *', 'select private.expire_place_data()'
    );
  else
    raise notice 'pg_cron is not available: Google place data on the server will not expire';
  end if;
end;
$$;

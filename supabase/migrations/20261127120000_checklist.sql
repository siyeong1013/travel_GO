-- travel GO: each trip's checklist (준비물) among its records.
-- Run after 20261108120000_visited_cities.sql: paste into the Supabase SQL Editor and run. Running it
-- again changes nothing.
--
-- A checklist item is a record like the others (`kind` 'checklistItem'), so it syncs, is shared with
-- the trip's members and goes with its trip. sync_push below is the one of 20261105120000_sync.sql
-- with that kind added. Until this runs, the server answers `invalid` for checklist items: they stay
-- on the device and go up on the first sync after it.

alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check
  check (kind in ('trip', 'scheduleItem', 'companion', 'expense', 'settlement', 'checklistItem'));

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
        or c_kind is null
        or c_kind not in ('trip', 'scheduleItem', 'companion', 'expense', 'settlement', 'checklistItem')
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

-- travel GO: trips that go to several cities.
-- Run after 20261106120000_countries.sql: paste into the Supabase SQL Editor and run. Running it
-- again changes nothing.
--
-- From record format 7 a trip has `cities` (a list) where it had one `city`. The functions that
-- read a trip's city read both, since records written before stay as they were:
--   private.expire_place_data()   also drops each city's coordinates once 30 days old
--   public.invite_preview(token)  `city` is the names of the trip's cities, joined with ' · '

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

  -- Trips from before format 7: one city.
  update public.records
  set data = jsonb_set(jsonb_set(data, '{city,location}', 'null'), '{city,fetchedAt}', 'null')
  where kind = 'trip' and not deleted
    and data #>> '{city,fetchedAt}' is not null
    and (data #>> '{city,fetchedAt}')::timestamptz <= now() - interval '30 days';

  -- Since: the list, rebuilt in its order with the old coordinates dropped.
  update public.records
  set data = jsonb_set(data, '{cities}', (
    select jsonb_agg(
      case
        when c ->> 'fetchedAt' is not null
          and (c ->> 'fetchedAt')::timestamptz <= now() - interval '30 days'
        then c || '{"location": null, "fetchedAt": null}'::jsonb
        else c
      end
      order by e.n
    )
    from jsonb_array_elements(data -> 'cities') with ordinality as e(c, n)
  ))
  where kind = 'trip' and not deleted
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(data -> 'cities') = 'array' then data -> 'cities' else '[]' end
      ) as c
      where c ->> 'fetchedAt' is not null
        and (c ->> 'fetchedAt')::timestamptz <= now() - interval '30 days'
    );
$$;

revoke all on function private.expire_place_data() from public, anon, authenticated;

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
        'city', coalesce(
          (
            select string_agg(c ->> 'name', ' · ' order by e.n)
            from jsonb_array_elements(
              case when jsonb_typeof(r.data -> 'cities') = 'array' then r.data -> 'cities' else '[]' end
            ) with ordinality as e(c, n)
          ),
          r.data #>> '{city,name}'
        ),
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

revoke all on function public.invite_preview(text) from public, anon, authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;

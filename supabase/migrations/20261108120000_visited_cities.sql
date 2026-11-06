-- travel GO: cities among the places visited ("다녀온 나라").
-- Run after 20261107120000_cities_regions.sql: paste into the Supabase SQL Editor and run. Running it
-- again changes nothing.
--
-- public.visited_countries keeps marks for the cities of a country's map too: where its map lists
-- the city (a region, or the country when in none) and its name there, `JP-01:삿포로`.

alter table public.visited_countries drop constraint if exists visited_countries_code_check;
alter table public.visited_countries add constraint visited_countries_code_check
  check (code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?(:[^:\n]+)?$' and char_length(code) <= 80);

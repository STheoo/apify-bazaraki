-- Create table for Bazaraki apartments-for-rent listings
create table if not exists public.bazaraki_rent_apartments (
    id text primary key,
    source text not null,
    url text not null unique,
    title text,
    price_text text,
    description text,
    city text,
    area_sqm numeric,
    bedrooms numeric,
    floor numeric,
    bathrooms numeric,
    apartment_type text,
    image_urls text[] not null default '{}',
    scraped_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Keep updated_at in sync
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.bazaraki_rent_apartments;
create trigger set_updated_at
before update on public.bazaraki_rent_apartments
for each row execute procedure public.set_updated_at();

-- Optional: enable RLS (service role bypasses RLS, so inserts will still work
-- when using SUPABASE_SERVICE_ROLE_KEY)
alter table public.bazaraki_rent_apartments enable row level security;

-- Example policies if you want to allow read access to anon users
-- (uncomment if needed)
-- create policy "Allow read to all" on public.bazaraki_rent_apartments
--   for select using (true);



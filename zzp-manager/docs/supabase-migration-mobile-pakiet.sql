-- ZZP Manager — migracja chmury pod pakiet mobilny (kilometrówka + data sprzedaży).
-- Wariant BEZPIECZNY / addytywny — nie usuwa danych. Uruchom w Supabase → SQL Editor.

-- 1. Data sprzedaży (leverdatum) na fakturach
alter table public.invoices add column if not exists sale_date date;

-- 2. Kilometrówka
create table if not exists public.mileage_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  from_location text default '',
  to_location text default '',
  distance_km numeric not null default 0,
  is_return boolean default false,
  purpose text default '',
  client_id uuid references public.clients(id),
  project_id uuid references public.projects(id),
  rate_per_km numeric default 0.23,
  origin text not null default 'desktop',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.mileage_entries enable row level security;
drop policy if exists "authenticated_all" on public.mileage_entries;
create policy "authenticated_all" on public.mileage_entries for all using (auth.role() = 'authenticated');

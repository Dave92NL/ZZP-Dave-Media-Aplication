-- ─────────────────────────────────────────────────────────────────────────────
-- Migracja: profil firmy (dane sprzedawcy) synchronizowany DESKTOP → CHMURA → TELEFON.
--
-- Po co: telefon ma pobierać dane firmy z aplikacji na komputerze zamiast trzymać
-- własną, ręcznie wpisaną kopię. Desktop wypycha profil do tej tabeli, telefon go czyta.
--
-- Jak uruchomić: Supabase → SQL Editor → New query → wklej całość → Run.
-- Projekt: mrmyznqentpabkrtybah. Bezpieczna, addytywna (create/alter IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.company_profile (
  id uuid primary key default gen_random_uuid(),
  name text default '',
  address text default '',
  postcode text default '',
  city text default '',
  country text default 'Nederland',
  kvk_number text default '',
  btw_number text default '',
  iban text default '',
  email text default '',
  phone text default '',
  invoice_footer text default '',
  origin text default 'desktop',
  updated_at timestamptz default now()
);

-- Jednoosobowa działalność — każdy zalogowany użytkownik (Ty, z desktopu i telefonu)
-- ma pełny dostęp. Spójne z pozostałymi tabelami.
alter table public.company_profile enable row level security;
drop policy if exists "authenticated_all" on public.company_profile;
create policy "authenticated_all" on public.company_profile for all using (auth.role() = 'authenticated');

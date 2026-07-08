-- ZZP Manager — schemat Supabase dla synchronizacji z telefonem (Faza 1)
--
-- Jak użyć:
-- 1. Zaloguj się na supabase.com i utwórz nowy (darmowy) projekt.
-- 2. Otwórz SQL Editor (menu po lewej) → New query.
-- 3. Wklej całą zawartość tego pliku i kliknij "Run".
--    (Skrypt najpierw bezpiecznie usuwa ewentualne wcześniejsze/częściowe tabele,
--    więc można go uruchamiać wielokrotnie bez błędów "already exists".)
-- 4. Utwórz bucket Storage o nazwie "receipts" (menu Storage → New bucket → prywatny).
-- 5. Utwórz siebie jako użytkownika w Authentication → Users → Add user (e-mail + hasło).
-- 6. W ZZP Manager: Ustawienia → Synchronizacja / Telefon → wklej Project URL i klucz "anon public"
--    (Project Settings → API), oraz e-mail/hasło z kroku 5.

create extension if not exists pgcrypto;

-- Bezpieczne czyszczenie — usuwa poprzednie/częściowe wersje tabel, jeśli istnieją
drop table if exists public.invoice_items cascade;
drop table if exists public.invoices cascade;
drop table if exists public.expenses cascade;
drop table if exists public.clients cascade;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text default '',
  email text default '',
  phone text default '',
  address text default '',
  postcode text default '',
  city text default '',
  country text default '',
  vat_number text default '',
  btw_rate numeric default 0,
  btw_reverse_charge boolean default false,
  currency text default 'EUR',
  notes text default '',
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique,
  client_id uuid references public.clients(id),
  status text default 'draft',
  issue_date date not null,
  due_date date not null,
  paid_date date,
  currency text default 'EUR',
  exchange_rate numeric default 1.0,
  subtotal numeric default 0,
  btw_rate numeric default 0,
  btw_amount numeric default 0,
  total numeric default 0,
  total_eur numeric default 0,
  notes text default '',
  reference text default '',
  btw_reverse_charge boolean default false,
  origin text not null default 'desktop',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric default 1,
  unit text default 'szt',
  unit_price numeric default 0,
  btw_rate numeric default 0,
  total numeric default 0,
  sort_order integer default 0
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'Inne',
  description text not null,
  amount numeric default 0,
  currency text default 'EUR',
  exchange_rate numeric default 1.0,
  amount_eur numeric default 0,
  btw_rate numeric default 0,
  btw_amount numeric default 0,
  btw_deductible boolean default true,
  date date not null,
  vendor text default '',
  receipt_storage_path text default '',
  is_deductible boolean default true,
  notes text default '',
  origin text not null default 'desktop',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.clients enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.expenses enable row level security;

-- Jednoosobowa działalność — każdy zalogowany użytkownik (czyli Ty, z desktopu i telefonu)
-- ma pełny dostęp. Wystarczające zabezpieczenie dla użytku jednoosobowego.
create policy "authenticated_all" on public.clients for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on public.invoices for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on public.invoice_items for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on public.expenses for all using (auth.role() = 'authenticated');

-- ── Storage (bucket "receipts") — OSOBNY system RLS, niezależny od tabel powyżej ──
-- Bez tej polityki upload zdjęć paragonów kończy się błędem
-- "new row violates row-level security policy". Uruchom PO utworzeniu bucketu
-- "receipts" w Storage (Storage → New bucket → prywatny).
drop policy if exists "authenticated_receipts_access" on storage.objects;
create policy "authenticated_receipts_access"
  on storage.objects for all
  using (bucket_id = 'receipts' and auth.role() = 'authenticated')
  with check (bucket_id = 'receipts' and auth.role() = 'authenticated');

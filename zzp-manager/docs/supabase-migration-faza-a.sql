-- ZZP Manager — MIGRACJA (Faza A), wariant BEZPIECZNY / NIENISZCZĄCY.
-- W przeciwieństwie do supabase-schema.sql ten skrypt NIE usuwa istniejących
-- tabel ani danych — tylko DODAJE nowe tabele i kolumny. Można uruchomić na
-- działającym projekcie, w którym masz już dane w clients/invoices/expenses.
--
-- Użycie: Supabase → SQL Editor → New query → wklej całość → Run.

create extension if not exists pgcrypto;

-- Nowa tabela: projekty
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references public.clients(id),
  description text default '',
  status text default 'active',
  start_date date,
  end_date date,
  hourly_rate numeric default 0,
  budget_hours numeric default 0,
  budget_amount numeric default 0,
  currency text default 'EUR',
  youtube_episode text default '',
  origin text not null default 'desktop',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Powiązanie faktur i kosztów z projektem (dodawane tylko jeśli nie istnieje)
alter table public.invoices add column if not exists project_id uuid references public.projects(id);
alter table public.expenses add column if not exists project_id uuid references public.projects(id);

-- Nowa tabela: wpisy czasu pracy
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id),
  invoice_id uuid references public.invoices(id),
  category text not null default 'Inne',
  description text default '',
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer default 0,
  is_pomodoro boolean default false,
  is_billable boolean default true,
  date date not null,
  origin text not null default 'desktop',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Nowa tabela: subskrypcje Web Push (Faza D)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text default '',
  created_at timestamptz default now()
);

-- RLS + polityki (idempotentnie)
alter table public.projects enable row level security;
alter table public.time_entries enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "authenticated_all" on public.projects;
create policy "authenticated_all" on public.projects for all using (auth.role() = 'authenticated');

drop policy if exists "authenticated_all" on public.time_entries;
create policy "authenticated_all" on public.time_entries for all using (auth.role() = 'authenticated');

drop policy if exists "authenticated_all" on public.push_subscriptions;
create policy "authenticated_all" on public.push_subscriptions for all using (auth.role() = 'authenticated');

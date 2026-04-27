-- =============================================================================
-- WERBUNDO / FATURA WEB — ESKİ SUPABASE PROJESİ İÇİN TEK SEFERLİK ÇALIŞTIR
-- Supabase → SQL Editor → Tümünü yapıştır → Run
-- Güvenli: IF NOT EXISTS / mevcut policy kontrolü
-- =============================================================================

-- Müşteri ek kolonları
alter table public.customers add column if not exists tax_no text;
alter table public.customers add column if not exists tax_office text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists address text;

-- Fatura güven skoru
alter table public.invoices add column if not exists confidence_total numeric(5,2);

-- Fatura kalemleri tablosu (yoksa oluşturur)
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  line_no int,
  description text not null,
  quantity numeric(14,3),
  unit text,
  unit_price numeric(14,2),
  line_total numeric(14,2),
  created_at timestamptz not null default now()
);

alter table public.invoice_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice_items' and policyname = 'invoice_items_select_own'
  ) then
    create policy "invoice_items_select_own"
    on public.invoice_items
    for select
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice_items' and policyname = 'invoice_items_insert_own'
  ) then
    create policy "invoice_items_insert_own"
    on public.invoice_items
    for insert
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice_items' and policyname = 'invoice_items_delete_own'
  ) then
    create policy "invoice_items_delete_own"
    on public.invoice_items
    for delete
    using (auth.uid() = user_id);
  end if;
end $$;

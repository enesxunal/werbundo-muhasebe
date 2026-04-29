-- =============================================================================
-- VERSİYON 2 — Supabase SQL Editor'da bir kez çalıştırın
-- Muhatap türü, fatura ödendi, resmî yazı / tebligat (correspondence)
-- =============================================================================

-- Muhatap türü (firma / kamu / diğer)
alter table public.customers
  add column if not exists counterparty_kind text not null default 'company'
  check (counterparty_kind in ('company', 'government', 'other'));

-- Fatura ödeme işareti
alter table public.invoices add column if not exists paid_at timestamptz;

-- documents: resmî yazı dosyaları için doc_type genişletmesi
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'documents'
      and constraint_name = 'documents_doc_type_check'
  ) then
    alter table public.documents drop constraint documents_doc_type_check;
  end if;
end $$;

alter table public.documents add constraint documents_doc_type_check
  check (doc_type in ('invoice', 'payment_receipt', 'correspondence'));

-- Resmî yazılar / ceza / ödeme bildirimi / uyum talepleri
create table if not exists public.correspondence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  category text not null check (category in (
    'official_letter',
    'fine',
    'payment_notice',
    'compliance',
    'other'
  )),
  issuer_name text,
  summary text,
  deadline_date date,
  response_deadline_date date,
  amount numeric(14,2),
  reference_no text,
  ocr_text text,
  completed_at timestamptz,
  saved_reply text,
  reply_lang text,
  parent_id uuid references public.correspondence (id) on delete set null,
  followup_thread text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists correspondence_user_deadline_idx
  on public.correspondence (user_id, deadline_date)
  where completed_at is null;

create index if not exists correspondence_user_created_idx
  on public.correspondence (user_id, created_at desc);

alter table public.correspondence enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'correspondence' and policyname = 'correspondence_select_own'
  ) then
    create policy "correspondence_select_own"
    on public.correspondence for select
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'correspondence' and policyname = 'correspondence_insert_own'
  ) then
    create policy "correspondence_insert_own"
    on public.correspondence for insert
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'correspondence' and policyname = 'correspondence_update_own'
  ) then
    create policy "correspondence_update_own"
    on public.correspondence for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'correspondence' and policyname = 'correspondence_delete_own'
  ) then
    create policy "correspondence_delete_own"
    on public.correspondence for delete
    using (auth.uid() = user_id);
  end if;
end $$;

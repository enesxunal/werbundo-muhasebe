-- Banka mutabakatı (aylık hesap özeti vs faturalar)
-- Supabase SQL Editor'da bir kez çalıştırın.

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
  check (doc_type in ('invoice', 'payment_receipt', 'correspondence', 'bank_statement'));

create table if not exists public.month_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  status text not null default 'draft' check (status in ('draft', 'completed')),
  document_id uuid references public.documents (id) on delete set null,
  bank_txn_count int not null default 0,
  matched_count int not null default 0,
  missing_count int not null default 0,
  ai_summary text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_year, period_month)
);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reconciliation_id uuid not null references public.month_reconciliations (id) on delete cascade,
  line_index int not null default 0,
  txn_date date,
  amount numeric(14, 2) not null,
  currency text not null default 'EUR',
  counterparty text,
  description text,
  match_status text not null default 'missing_invoice'
    check (match_status in ('matched', 'missing_invoice')),
  invoice_id uuid references public.invoices (id) on delete set null,
  match_confidence numeric(5, 2),
  match_note text,
  created_at timestamptz not null default now()
);

create index if not exists month_reconciliations_user_period_idx
  on public.month_reconciliations (user_id, period_year desc, period_month desc);

create index if not exists bank_transactions_reconciliation_idx
  on public.bank_transactions (reconciliation_id, line_index);

alter table public.month_reconciliations enable row level security;
alter table public.bank_transactions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'month_reconciliations' and policyname = 'month_reconciliations_select_own'
  ) then
    create policy "month_reconciliations_select_own"
    on public.month_reconciliations for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'month_reconciliations' and policyname = 'month_reconciliations_insert_own'
  ) then
    create policy "month_reconciliations_insert_own"
    on public.month_reconciliations for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'month_reconciliations' and policyname = 'month_reconciliations_update_own'
  ) then
    create policy "month_reconciliations_update_own"
    on public.month_reconciliations for update
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'month_reconciliations' and policyname = 'month_reconciliations_delete_own'
  ) then
    create policy "month_reconciliations_delete_own"
    on public.month_reconciliations for delete using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bank_transactions' and policyname = 'bank_transactions_select_own'
  ) then
    create policy "bank_transactions_select_own"
    on public.bank_transactions for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bank_transactions' and policyname = 'bank_transactions_insert_own'
  ) then
    create policy "bank_transactions_insert_own"
    on public.bank_transactions for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bank_transactions' and policyname = 'bank_transactions_delete_own'
  ) then
    create policy "bank_transactions_delete_own"
    on public.bank_transactions for delete using (auth.uid() = user_id);
  end if;
end $$;

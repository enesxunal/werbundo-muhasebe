-- Supabase SQL Editor'a yapıştırıp çalıştırın.

-- 1) Customers (müşteriler)
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  tax_no text,
  tax_office text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;

create policy "customers_select_own"
on public.customers
for select
using (auth.uid() = user_id);

create policy "customers_insert_own"
on public.customers
for insert
with check (auth.uid() = user_id);

create policy "customers_update_own"
on public.customers
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "customers_delete_own"
on public.customers
for delete
using (auth.uid() = user_id);

-- 2) Documents (yüklenen dosyalar: fatura, dekont vb.)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  doc_type text not null check (doc_type in ('invoice', 'payment_receipt')),
  original_filename text,
  storage_bucket text not null default 'documents',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "documents_select_own"
on public.documents
for select
using (auth.uid() = user_id);

create policy "documents_insert_own"
on public.documents
for insert
with check (auth.uid() = user_id);

create policy "documents_delete_own"
on public.documents
for delete
using (auth.uid() = user_id);

-- 3) Invoices (faturalar)
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete restrict,
  document_id uuid references public.documents (id) on delete set null,
  invoice_no text,
  issue_date date not null,
  currency text not null default 'TRY',
  subtotal numeric(14,2),
  vat_rate numeric(6,2), -- 20.00 gibi
  vat_total numeric(14,2),
  total numeric(14,2) not null,
  confidence_total numeric(5,2), -- OCR/heuristic güven skoru (0-100)
  notes text,
  created_at timestamptz not null default now()
);

alter table public.invoices enable row level security;

create policy "invoices_select_own"
on public.invoices
for select
using (auth.uid() = user_id);

create policy "invoices_insert_own"
on public.invoices
for insert
with check (auth.uid() = user_id);

create policy "invoices_update_own"
on public.invoices
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "invoices_delete_own"
on public.invoices
for delete
using (auth.uid() = user_id);

-- 4) Invoice Items (fatura kalemleri)
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

create policy "invoice_items_select_own"
on public.invoice_items
for select
using (auth.uid() = user_id);

create policy "invoice_items_insert_own"
on public.invoice_items
for insert
with check (auth.uid() = user_id);

create policy "invoice_items_delete_own"
on public.invoice_items
for delete
using (auth.uid() = user_id);

-- 2) Storage bucket (documents)
-- Supabase UI > Storage'dan 'documents' isimli bucket oluşturun.
-- Private bucket kullanıyorsanız, yükleme için storage.objects RLS policy zorunludur.

-- Storage policies (documents bucket) - kullanıcı sadece kendi klasörüne yazsın/okusun.
-- Dosya yolu formatımız: <user_id>/<docType>/<uuid>.<ext>
do $$
begin
  -- INSERT
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_objects_insert_own'
  ) then
    create policy "documents_objects_insert_own"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'documents'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  -- SELECT (signed url üretimi / listeleme için)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_objects_select_own'
  ) then
    create policy "documents_objects_select_own"
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'documents'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  -- DELETE (istersen ileride silme özelliği)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_objects_delete_own'
  ) then
    create policy "documents_objects_delete_own"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'documents'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Eski / eksik şema: TEK DOSYA — Supabase SQL Editor'da bir kez çalıştırın
-- `supabase/bootstrap_once.sql` (müşteri kolonları + confidence_total + invoice_items + RLS)
-- Aşağıdaki satırlar aynı içeriğin kısa özeti; tamamı bootstrap_once.sql içinde.
-- ---------------------------------------------------------------------------
alter table public.customers add column if not exists tax_no text;
alter table public.customers add column if not exists tax_office text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists address text;

alter table public.invoices add column if not exists confidence_total numeric(5,2);

-- Versiyon 2 (muhatap türü, fatura ödeme, resmî yazılar): tam SQL → `supabase/migration_v2.sql`

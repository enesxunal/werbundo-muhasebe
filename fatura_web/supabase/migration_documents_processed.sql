-- İşlenmiş (düzleştirilmiş) belge görseli yolu — bir kez Supabase SQL Editor'da çalıştırın
alter table public.documents add column if not exists processed_storage_path text;

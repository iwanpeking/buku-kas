-- Jalankan skrip ini di Supabase: Project Anda -> SQL Editor -> New Query -> paste -> Run

create table if not exists kv_store (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

alter table kv_store enable row level security;

-- Siapa saja yang SUDAH LOGIN boleh baca & tulis data bersama ini.
create policy "authenticated read" on kv_store
  for select using (auth.role() = 'authenticated');

create policy "authenticated write" on kv_store
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated update" on kv_store
  for update using (auth.role() = 'authenticated');

create policy "authenticated delete" on kv_store
  for delete using (auth.role() = 'authenticated');

-- ============================================================
-- SKEMA BUKU KAS v3 — privat per akun, project bisa dibagikan
-- (perbaikan: "infinite recursion" pada kebijakan projects <->
--  project_members, diputus pakai fungsi security definer)
-- ============================================================
-- Jalankan skrip ini di Supabase: Project Anda -> SQL Editor ->
-- New Query -> paste semuanya -> Run.
--
-- Aman dijalankan ulang di atas versi v2 sebelumnya — skrip ini
-- menghapus tabel & fungsi lama lalu membuat ulang dari nol.
-- ============================================================

drop table if exists project_members cascade;
drop table if exists projects cascade;
drop table if exists kv_store cascade;
drop function if exists is_project_owner(uuid);
drop function if exists is_project_member(uuid);

-- ----------------------------------------------------------
-- LANGKAH 1 — buat semua tabel dulu (belum ada kebijakan).
-- ----------------------------------------------------------

create table kv_store (
  key text not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  value text not null,
  updated_at timestamptz default now(),
  primary key (key, owner_id)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  email text not null,
  created_at timestamptz default now(),
  primary key (project_id, email)
);

-- ----------------------------------------------------------
-- LANGKAH 2 — fungsi bantu SECURITY DEFINER. Fungsi jenis ini
-- berjalan tanpa terkena RLS tabel yang diceknya, sehingga
-- memutus perulangan tanpa-henti antara kebijakan projects dan
-- project_members yang saling merujuk satu sama lain.
-- ----------------------------------------------------------

create or replace function is_project_owner(pid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from projects p
    where p.id = pid and p.owner_id = auth.uid()
  );
$$;

create or replace function is_project_member(pid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from project_members pm
    where pm.project_id = pid and lower(pm.email) = lower(coalesce(auth.email(), ''))
  );
$$;

-- ----------------------------------------------------------
-- LANGKAH 3 — aktifkan Row Level Security.
-- ----------------------------------------------------------
alter table kv_store enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;

-- ----------------------------------------------------------
-- LANGKAH 4 — pasang semua kebijakan, memakai fungsi bantu di
-- atas (bukan subquery langsung antar tabel) supaya tidak muncul
-- "infinite recursion" lagi.
-- ----------------------------------------------------------

-- kv_store: cuma pemiliknya sendiri
create policy "kv_select_own" on kv_store
  for select using (owner_id = auth.uid());
create policy "kv_insert_own" on kv_store
  for insert with check (owner_id = auth.uid());
create policy "kv_update_own" on kv_store
  for update using (owner_id = auth.uid());
create policy "kv_delete_own" on kv_store
  for delete using (owner_id = auth.uid());

-- projects: pemilik ATAU anggota yang diundang
create policy "projects_select" on projects
  for select using (owner_id = auth.uid() or is_project_member(id));

create policy "projects_insert" on projects
  for insert with check (owner_id = auth.uid());

create policy "projects_update" on projects
  for update using (owner_id = auth.uid() or is_project_member(id));

create policy "projects_delete" on projects
  for delete using (owner_id = auth.uid());

-- project_members: cuma pemilik project yang boleh atur undangan;
-- anggota boleh lihat siapa saja yang ada di project itu
create policy "members_select" on project_members
  for select using (is_project_owner(project_id) or lower(email) = lower(coalesce(auth.email(), '')));

create policy "members_insert" on project_members
  for insert with check (is_project_owner(project_id));

create policy "members_delete" on project_members
  for delete using (is_project_owner(project_id));

-- ============================================================
-- Transfer Tracker — Supabase schema, RLS, Storage
-- Run in: Supabase Dashboard → SQL Editor (or supabase db push)
-- ============================================================

-- Extensions (gen_random_uuid)
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Table: transfers
-- ------------------------------------------------------------
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  person_name text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  image_url text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered')),
  created_at timestamptz not null default now()
);

create index if not exists transfers_created_at_idx on public.transfers (created_at desc);
create index if not exists transfers_person_name_idx on public.transfers (person_name);

comment on table public.transfers is 'Money transfer records; public read, admin write via RLS.';

alter table public.transfers enable row level security;

-- Drop policies if re-running (idempotent-ish)
drop policy if exists "transfers_select_public" on public.transfers;
drop policy if exists "transfers_insert_authenticated" on public.transfers;
drop policy if exists "transfers_update_authenticated" on public.transfers;
drop policy if exists "transfers_delete_authenticated" on public.transfers;

-- Public read-only
create policy "transfers_select_public"
  on public.transfers
  for select
  to anon, authenticated
  using (true);

-- Authenticated admin: full write
create policy "transfers_insert_authenticated"
  on public.transfers
  for insert
  to authenticated
  with check (true);

create policy "transfers_update_authenticated"
  on public.transfers
  for update
  to authenticated
  using (true)
  with check (true);

create policy "transfers_delete_authenticated"
  on public.transfers
  for delete
  to authenticated
  using (true);

-- ------------------------------------------------------------
-- Storage: bucket transfer-images (public URLs for images)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transfer-images',
  'transfer-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "transfer_images_public_read" on storage.objects;
drop policy if exists "transfer_images_auth_insert" on storage.objects;
drop policy if exists "transfer_images_auth_update" on storage.objects;
drop policy if exists "transfer_images_auth_delete" on storage.objects;

-- Anyone can read objects in this public bucket (object URLs are public)
create policy "transfer_images_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'transfer-images');

create policy "transfer_images_auth_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'transfer-images');

create policy "transfer_images_auth_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'transfer-images')
  with check (bucket_id = 'transfer-images');

create policy "transfer_images_auth_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'transfer-images');

-- Realtime: in Dashboard → Database → Replication, enable `public.transfers`
-- (or run once if your project allows:)
--   alter publication supabase_realtime add table public.transfers;

-- ------------------------------------------------------------
-- Admin allowlist (emails that may use admin login / dashboard)
-- ------------------------------------------------------------
create table if not exists public.admin_emails (
  email text primary key
);

comment on table public.admin_emails is 'Lowercase-trimmed admin emails; no direct client reads — use is_allowed_admin_email().';

alter table public.admin_emails enable row level security;

-- No policies: anon/authenticated cannot read rows directly; RPC below uses SECURITY DEFINER.

create or replace function public.is_allowed_admin_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_emails e
    where lower(trim(e.email)) = lower(trim(p_email))
  );
$$;

comment on function public.is_allowed_admin_email(text) is 'Returns true if p_email is listed in admin_emails (case-insensitive).';

revoke all on function public.is_allowed_admin_email(text) from public;
grant execute on function public.is_allowed_admin_email(text) to anon, authenticated;

-- Seed admins in SQL Editor (example):
--   insert into public.admin_emails (email) values ('admin@example.com')
--   on conflict (email) do nothing;

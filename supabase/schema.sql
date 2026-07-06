-- Run this in Supabase Dashboard → SQL Editor (once per project)

create table if not exists public.user_vaults (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_vaults enable row level security;

create policy "user_vaults_select_own"
  on public.user_vaults for select
  using (auth.uid() = user_id);

create policy "user_vaults_insert_own"
  on public.user_vaults for insert
  with check (auth.uid() = user_id);

create policy "user_vaults_update_own"
  on public.user_vaults for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_vaults_delete_own"
  on public.user_vaults for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_vaults to authenticated;

-- ArenaHub — perfis, administradores da plataforma e vínculo gestor ↔ arena.
-- Não destrutiva: só cria objetos novos (IF NOT EXISTS) e não altera dados de public.arenas.
--
-- Papéis são DERIVADOS, não armazenados no perfil:
--   athlete -> toda conta com perfil
--   manager -> existe ao menos uma linha em public.arena_managers para o usuário
--   admin   -> existe linha em public.platform_admins (concedida só por SQL privilegiado)

begin;

-- Funções auxiliares ficam fora dos schemas expostos pela API do Supabase.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or char_length(phone) between 8 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Cria o perfil quando a conta nasce no Supabase Auth. Copia apenas o nome
-- (dado não privilegiado) dos metadados do cadastro.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', ''), 120))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Backfill das contas já existentes (idempotente).
insert into public.profiles (id, full_name)
select u.id, left(coalesce(u.raw_user_meta_data ->> 'name', ''), 120)
from auth.users u
on conflict (id) do nothing;

-- ── platform_admins ─────────────────────────────────────────────────────────
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by text not null,
  note text
);

-- ── arena_managers (N:N) ────────────────────────────────────────────────────
-- arenas.id é inteiro; bigint referencia integer ou bigint sem conversão.
create table if not exists public.arena_managers (
  arena_id bigint not null references public.arenas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (arena_id, user_id)
);
create index if not exists arena_managers_user_id_idx on public.arena_managers (user_id);

-- ── Funções de autorização ──────────────────────────────────────────────────
-- SECURITY DEFINER evita recursão de RLS ao consultar as próprias tabelas
-- protegidas. Só leem; usam auth.uid() e nunca recebem o id do usuário.
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins where user_id = (select auth.uid())
  );
$$;

create or replace function private.manages_arena(target_arena_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.arena_managers
    where arena_id = target_arena_id and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_platform_admin() from public;
revoke all on function private.manages_arena(bigint) from public;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.manages_arena(bigint) to authenticated;

-- ── Privilégios de tabela (Data API) ────────────────────────────────────────
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Apenas colunas não privilegiadas são editáveis pelo próprio usuário.
grant update (full_name, phone) on public.profiles to authenticated;

revoke all on public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated;

revoke all on public.arena_managers from anon, authenticated;
grant select on public.arena_managers to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.arena_managers enable row level security;

drop policy if exists "profiles: ler o próprio ou admin" on public.profiles;
create policy "profiles: ler o próprio ou admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_platform_admin()));

drop policy if exists "profiles: editar o próprio" on public.profiles;
create policy "profiles: editar o próprio" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "platform_admins: ler a própria linha ou admin" on public.platform_admins;
create policy "platform_admins: ler a própria linha ou admin" on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

drop policy if exists "arena_managers: ler os próprios vínculos ou admin" on public.arena_managers;
create policy "arena_managers: ler os próprios vínculos ou admin" on public.arena_managers
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

-- Sem políticas de INSERT/UPDATE/DELETE em platform_admins e arena_managers:
-- pela Data API ninguém escreve nelas. Concessões passam por SQL privilegiado
-- (admin) ou, futuramente, pelo backend após validar o papel de admin.

commit;

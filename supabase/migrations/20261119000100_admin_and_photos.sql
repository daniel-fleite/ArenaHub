-- ArenaHub — administração da plataforma e fotos das arenas.
-- Depende de: 20261026000100, 20261026000200_arenas_rls.sql.
-- Não destrutiva: só ADICIONA colunas com valor padrão (registros existentes ficam
-- 'ativa'/'ativo'); recria a política de leitura pública de arenas.
--   • arenas.image_url  — foto da arena (https), exibida no catálogo.
--   • arenas.status     — 'ativa' | 'inativa'; inativas saem do catálogo e não aceitam reservas.
--   • arenas.created_at — data de cadastro (registros antigos recebem a data desta migração).
--   • profiles.status   — 'ativo' | 'suspenso'; contas suspensas são bloqueadas pelo backend.
-- Nenhuma dessas colunas tem GRANT UPDATE para anon/authenticated: só o backend (admin) altera.

begin;

alter table public.arenas
  add column if not exists image_url text,
  add column if not exists status text not null default 'ativa',
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'arenas_status_check' and conrelid = 'public.arenas'::regclass) then
    alter table public.arenas add constraint arenas_status_check check (status in ('ativa', 'inativa'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'arenas_image_url_check' and conrelid = 'public.arenas'::regclass) then
    alter table public.arenas add constraint arenas_image_url_check
      check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 1000));
  end if;
end;
$$;

alter table public.profiles
  add column if not exists status text not null default 'ativo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_status_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_status_check check (status in ('ativo', 'suspenso'));
  end if;
end;
$$;

-- Catálogo pela Data API: visitantes veem só arenas ativas; gestor vinculado e admin veem todas.
drop policy if exists "arenas: leitura pública" on public.arenas;
create policy "arenas: leitura pública" on public.arenas
  for select to anon
  using (status = 'ativa');

drop policy if exists "arenas: leitura autenticada" on public.arenas;
create policy "arenas: leitura autenticada" on public.arenas
  for select to authenticated
  using (status = 'ativa' or (select private.is_platform_admin()) or private.manages_arena(id));

-- Reafirma que status/foto/data não são editáveis pela Data API (só name, city, state).
revoke update on public.arenas from authenticated;
grant update (name, city, state) on public.arenas to authenticated;

create index if not exists arenas_status_idx on public.arenas (status);

commit;

-- ArenaHub — quadras das arenas.
-- Depende de 20261026000100 (schema private, private.touch_updated_at,
-- private.is_platform_admin, private.manages_arena). Não altera tabelas existentes.
--
-- Escrita pelo backend Express (papel dono das tabelas; autorização nos middlewares) e,
-- pela Data API, somente por admin ou gestor vinculado à arena (RLS abaixo).
--
-- Reservas (módulo futuro): a FK de reservas para quadras deverá ser
--   court_id bigint not null references public.courts (id) on delete restrict
-- para impedir a exclusão de quadras com reservas e preservar o histórico. Quadras que
-- saírem de operação devem ir para status 'inativa' em vez de serem excluídas. O
-- on delete cascade de courts.arena_id também passará a ser barrado pelo RESTRICT
-- quando houver reservas, o que é o comportamento desejado.

begin;

create table if not exists public.courts (
  id bigint generated always as identity primary key,
  arena_id bigint not null references public.arenas (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  sports text[] not null check (
    cardinality(sports) between 1 and 10
    and sports <@ array['society', 'futsal', 'futevolei', 'beach-tennis']::text[]
  ),
  status text not null default 'ativa' check (status in ('ativa', 'manutencao', 'inativa')),
  capacity integer check (capacity is null or capacity between 1 and 200),
  hourly_rate numeric(10, 2) check (hourly_rate is null or hourly_rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courts_arena_name_key unique (arena_id, name)
);

-- courts_arena_name_key já indexa (arena_id, name) e atende às buscas por arena.
create index if not exists courts_active_by_arena_idx
  on public.courts (arena_id) where status = 'ativa';

drop trigger if exists courts_touch_updated_at on public.courts;
create trigger courts_touch_updated_at
  before update on public.courts
  for each row execute function private.touch_updated_at();

-- ── Privilégios (Data API) ──────────────────────────────────────────────────
revoke all on public.courts from anon, authenticated;
grant select on public.courts to anon, authenticated;
grant insert (arena_id, name, sports, status, capacity, hourly_rate) on public.courts to authenticated;
-- arena_id fora da lista: uma quadra nunca muda de arena.
grant update (name, sports, status, capacity, hourly_rate) on public.courts to authenticated;
grant delete on public.courts to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.courts enable row level security;

-- anon não tem acesso ao schema private: sua política não chama as funções de autorização.
drop policy if exists "courts: visitantes leem quadras ativas" on public.courts;
create policy "courts: visitantes leem quadras ativas" on public.courts
  for select to anon
  using (status = 'ativa');

drop policy if exists "courts: autenticados leem ativas; gestor/admin leem todas" on public.courts;
create policy "courts: autenticados leem ativas; gestor/admin leem todas" on public.courts
  for select to authenticated
  using (
    status = 'ativa'
    or (select private.is_platform_admin())
    or private.manages_arena(arena_id)
  );

drop policy if exists "courts: admin ou gestor vinculado cria" on public.courts;
create policy "courts: admin ou gestor vinculado cria" on public.courts
  for insert to authenticated
  with check ((select private.is_platform_admin()) or private.manages_arena(arena_id));

drop policy if exists "courts: admin ou gestor vinculado edita" on public.courts;
create policy "courts: admin ou gestor vinculado edita" on public.courts
  for update to authenticated
  using ((select private.is_platform_admin()) or private.manages_arena(arena_id))
  with check ((select private.is_platform_admin()) or private.manages_arena(arena_id));

drop policy if exists "courts: admin ou gestor vinculado remove" on public.courts;
create policy "courts: admin ou gestor vinculado remove" on public.courts
  for delete to authenticated
  using ((select private.is_platform_admin()) or private.manages_arena(arena_id));

commit;

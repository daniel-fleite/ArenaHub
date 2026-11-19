-- ArenaHub — políticas de RLS em public.arenas (tabela existente).
-- Estado confirmado antes desta migração: id bigint, RLS já ativa (relrowsecurity = true,
-- relforcerowsecurity = false) e nenhuma política, ou seja, a Data API hoje nega tudo.
-- Não altera colunas nem registros. Depende de 20261026000100 (schema private e funções).
--
-- O backend Express (pg + DATABASE_URL) já opera com a RLS ativa e sem políticas, logo seu papel
-- ignora RLS (dono da tabela ou BYPASSRLS); estas políticas não o afetam. A autorização do
-- Express é feita pelos middlewares em backend/src/middleware/auth.ts.

begin;

-- Idempotente: a RLS já está ativa; mantida para o caso de ambientes novos.
alter table public.arenas enable row level security;

-- Privilégios da Data API: remove os padrões amplos e concede só o necessário.
revoke all on public.arenas from anon, authenticated;
grant select on public.arenas to anon, authenticated;
grant insert, delete on public.arenas to authenticated;
-- Edição restrita às colunas de dados: ninguém troca o id da arena.
grant update (name, city, state) on public.arenas to authenticated;

drop policy if exists "arenas: leitura pública" on public.arenas;
create policy "arenas: leitura pública" on public.arenas
  for select to anon, authenticated
  using (true);

drop policy if exists "arenas: admin cria" on public.arenas;
create policy "arenas: admin cria" on public.arenas
  for insert to authenticated
  with check ((select private.is_platform_admin()));

drop policy if exists "arenas: admin ou gestor vinculado edita" on public.arenas;
create policy "arenas: admin ou gestor vinculado edita" on public.arenas
  for update to authenticated
  using ((select private.is_platform_admin()) or private.manages_arena(id))
  with check ((select private.is_platform_admin()) or private.manages_arena(id));

drop policy if exists "arenas: admin remove" on public.arenas;
create policy "arenas: admin remove" on public.arenas
  for delete to authenticated
  using ((select private.is_platform_admin()));

commit;

-- ArenaHub — REMOVE os dados de demonstração criados por demo_seed.sql.
-- Apaga somente as 10 arenas de demonstração (e o que pertence a elas) e as contas
-- cliente*@demo.arenahub.com.br. Não toca em outras arenas, contas ou no vínculo
-- do gestor com arenas reais. Aplicar no SQL Editor (papel postgres).

begin;

do $remove$
declare
  demo_arenas text[] := array[
    'Arena Vila Verde', 'Central Sports Campolim', 'Areia Beach Club', 'Arena Gol de Placa',
    'Litoral Beach Arena', 'Complexo Esportivo Éden', 'Arena Society Parque', 'Quadra Viva Futsal',
    'Pé na Areia Sports', 'Arena Premium Jundiaí'
  ];
  ids bigint[];
begin
  select coalesce(array_agg(id), '{}') into ids from public.arenas where name = any (demo_arenas);

  -- Ordem respeita as FKs RESTRICT: vendas → produtos; reservas → quadras.
  delete from public.sales where arena_id = any (ids);
  delete from public.reservations where arena_id = any (ids);
  delete from public.arenas where id = any (ids); -- cascata: quadras, produtos, campeonatos, equipes, publicações, vínculos

  delete from public.reservations where user_id in (select id from auth.users where email like '%@demo.arenahub.com.br');
  delete from auth.users where email like '%@demo.arenahub.com.br'; -- cascata: perfis

  raise notice 'Removidas % arenas de demonstração', coalesce(array_length(ids, 1), 0);
end;
$remove$;

commit;

-- ArenaHub — fotos de exemplo para as arenas cadastradas.
-- Aplicar DEPOIS de 20261119000100_admin_and_photos.sql. Só preenche arenas SEM foto
-- (não sobrescreve fotos definidas pela administração). Pode ser executado mais de uma vez.
--
-- Fotos de bancos de imagens gratuitos (Licença Unsplash / Licença Pexels: uso livre, inclusive
-- comercial, sem necessidade de atribuição). Créditos:
--   Society (gaiola iluminada, vista aérea) ... Tahamie Farooqui · unsplash.com/photos/BTmakFfGSAw
--   Gol em grama sintética à noite ............ Arpit Sharma · unsplash.com/photos/W8XwIYFDh2I
--   Futebol em grama sintética ................ Aryan K · unsplash.com/photos/qRIkjGzNpYQ
--   Society à noite (gaiola) ................... Falaq Lazuardi · unsplash.com/photos/LSOTmGcdaKQ
--   Dois campos, vista aérea ................... Mario Ortiz · pexels.com/photo/12039814
--   Gol iluminado à noite ...................... Ambitious Studio · unsplash.com/photos/6l0RUEu1dhw
--   Society coberto ............................ Adil Sattarov · unsplash.com/photos/D8nY08SSfkI
--   Society indoor ............................. Srijonism · pexels.com/photo/15818644
--   Futsal em quadra coberta ................... Mohamed Ayman Marso · pexels.com/photo/37097046
--   Quadra de areia entre palmeiras ............ Jonathan Borba · unsplash.com/photos/miKcna0IDqo
--   Rede de vôlei na praia ..................... Lin Htet Tun · pexels.com/photo/35881909
--   Várias quadras de areia (vista aérea) ...... Isi Parente · pexels.com/photo/23639645

begin;

update public.arenas a
set image_url = photos.url
from (values
  ('Arena Vila Verde',        'https://images.unsplash.com/photo-1759210720456-c9814f721479?w=1200&q=70&auto=format&fit=crop'),
  ('Arena Gol de Placa',      'https://images.unsplash.com/photo-1779288440792-f47b71179e21?w=1200&q=70&auto=format&fit=crop'),
  ('Arena Duo',               'https://images.unsplash.com/photo-1785528235873-aa0c1ab2c5c8?w=1200&q=70&auto=format&fit=crop'),
  ('Arena Society Parque',    'https://images.unsplash.com/photo-1630420598913-44208d36f9af?w=1200&q=70&auto=format&fit=crop'),
  ('Complexo Esportivo Éden', 'https://images.pexels.com/photos/12039814/pexels-photo-12039814.jpeg?auto=compress&cs=tinysrgb&w=1200'),
  ('Arena Teste',             'https://images.unsplash.com/photo-1652190364244-96ad73c21c4c?w=1200&q=70&auto=format&fit=crop'),
  ('Arena Premium Jundiaí',   'https://images.unsplash.com/photo-1774798154084-c2b861d8581d?w=1200&q=70&auto=format&fit=crop'),
  ('Central Sports Campolim', 'https://images.pexels.com/photos/15818644/pexels-photo-15818644.jpeg?auto=compress&cs=tinysrgb&w=1200'),
  ('Quadra Viva Futsal',      'https://images.pexels.com/photos/37097046/pexels-photo-37097046.jpeg?auto=compress&cs=tinysrgb&w=1200'),
  ('Areia Beach Club',        'https://images.unsplash.com/photo-1771526087551-db6be2f51a28?w=1200&q=70&auto=format&fit=crop'),
  ('Litoral Beach Arena',     'https://images.pexels.com/photos/35881909/pexels-photo-35881909.jpeg?auto=compress&cs=tinysrgb&w=1200'),
  ('Pé na Areia Sports',      'https://images.pexels.com/photos/23639645/pexels-photo-23639645.jpeg?auto=compress&cs=tinysrgb&w=1200')
) as photos(name, url)
where a.name = photos.name and a.image_url is null;

-- Arenas sem foto específica: uma foto genérica conforme a modalidade das quadras.
update public.arenas a
set image_url = case
  when exists (select 1 from public.courts c where c.arena_id = a.id and c.sports && array['beach-tennis', 'futevolei'])
       and not exists (select 1 from public.courts c where c.arena_id = a.id and c.sports && array['society', 'futsal'])
    then 'https://images.unsplash.com/photo-1771526087551-db6be2f51a28?w=1200&q=70&auto=format&fit=crop'
  when exists (select 1 from public.courts c where c.arena_id = a.id and c.sports && array['futsal'])
       and not exists (select 1 from public.courts c where c.arena_id = a.id and c.sports && array['society'])
    then 'https://images.pexels.com/photos/37097046/pexels-photo-37097046.jpeg?auto=compress&cs=tinysrgb&w=1200'
  else 'https://images.unsplash.com/photo-1759210720456-c9814f721479?w=1200&q=70&auto=format&fit=crop'
end
where a.image_url is null;

commit;

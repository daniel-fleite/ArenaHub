-- ArenaHub — DADOS DE DEMONSTRAÇÃO para apresentação.
--
-- Cria 10 arenas com quadras, ~60 dias de histórico e 14 dias de agenda de reservas, produtos,
-- vendas, campeonatos com equipes e publicações. As arenas ficam vinculadas como gestor à conta
-- indicada em v_manager_email. Os clientes são contas de demonstração SEM senha (não fazem login),
-- com e-mail @demo.arenahub.com.br.
--
-- Como aplicar: SQL Editor do Supabase (papel postgres), DEPOIS de todas as migrações.
-- Para remover depois da apresentação: supabase/seed/demo_seed_remove.sql.
--
-- Observação: o trigger reservations_guard recusa reservas no passado. Para criar o histórico,
-- ele é desligado só durante a inserção das reservas e religado em seguida; preços são calculados
-- como o banco calcula (courts.hourly_rate × horas). A EXCLUDE de sobreposição continua ativa.

begin;

do $seed$
declare
  v_manager_email text := 'daniel@arenahub.com';   -- ← troque se quiser vincular outra conta
  v_manager uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_customers uuid[] := '{}';
  v_arena bigint;
  v_court record;
  v_product record;
  v_day date;
  v_slot int[];
  v_status text;
  v_user uuid;
  v_champ bigint;
  v_i int;
  v_n int;
  v_stock int;
  -- Arenas: nome, cidade, UF
  arenas_data text[][] := array[
    ['Arena Vila Verde', 'Sorocaba', 'SP'],
    ['Central Sports Campolim', 'Sorocaba', 'SP'],
    ['Areia Beach Club', 'Sorocaba', 'SP'],
    ['Arena Gol de Placa', 'Votorantim', 'SP'],
    ['Litoral Beach Arena', 'Itu', 'SP'],
    ['Complexo Esportivo Éden', 'Sorocaba', 'SP'],
    ['Arena Society Parque', 'Salto', 'SP'],
    ['Quadra Viva Futsal', 'Itu', 'SP'],
    ['Pé na Areia Sports', 'Indaiatuba', 'SP'],
    ['Arena Premium Jundiaí', 'Jundiaí', 'SP']
  ];
  -- Quadras por arena (índice da arena; nome; modalidades; preço/hora; capacidade)
  courts_data text[][] := array[
    ['1','Society 1','society','180','14'], ['1','Society 2','society','160','14'], ['1','Futsal Coberta','futsal','140','10'],
    ['2','Society Coberta','society','220','14'], ['2','Futsal A','futsal','150','10'], ['2','Futsal B','futsal','150','10'],
    ['3','Areia 1','futevolei,beach-tennis','90','4'], ['3','Areia 2','futevolei,beach-tennis','90','4'], ['3','Areia 3','beach-tennis','100','4'],
    ['4','Campo Society','society','170','16'], ['4','Futsal','futsal','130','10'],
    ['5','Quadra Norte','futevolei,beach-tennis','85','4'], ['5','Quadra Sul','futevolei,beach-tennis','85','4'],
    ['6','Society Principal','society','200','14'], ['6','Society Auxiliar','society','170','14'], ['6','Futsal','futsal','140','10'], ['6','Areia','beach-tennis,futevolei','95','4'],
    ['7','Society 1','society','150','14'], ['7','Society 2','society','150','14'],
    ['8','Futsal Profissional','futsal','160','10'], ['8','Futsal Treino','futsal','120','10'],
    ['9','Beach 1','beach-tennis','110','4'], ['9','Beach 2','beach-tennis','110','4'], ['9','Futevôlei','futevolei','100','4'],
    ['10','Society Premium','society','260','14'], ['10','Society Coberta','society','230','14'], ['10','Beach Tennis','beach-tennis','120','4']
  ];
  customers_data text[][] := array[
    ['Lucas Andrade', '(15) 99812-3401'], ['Mariana Costa', '(15) 99734-5512'], ['Rafael Lima', '(15) 98823-1190'],
    ['Juliana Souza', '(15) 99610-7743'], ['Pedro Almeida', '(11) 98455-2209'], ['Camila Rocha', '(15) 99201-8856'],
    ['Bruno Carvalho', '(15) 98177-6634'], ['Fernanda Ribeiro', '(19) 99342-1078'], ['Gustavo Martins', '(15) 99788-4521'],
    ['Aline Ferreira', '(11) 97621-3345'], ['Thiago Barbosa', '(15) 99456-9012'], ['Patrícia Gomes', '(15) 98734-2287'],
    ['Diego Nascimento', '(15) 99123-6678'], ['Beatriz Moreira', '(19) 98890-4456']
  ];
  -- Faixas de horário sem sobreposição (início, fim)
  slots int[][] := array[[7,8],[8,9],[9,11],[17,18],[18,19],[19,20],[20,22],[22,23]];
  products_data text[][] := array[
    ['Água mineral 500ml','bebida','5','200'], ['Isotônico','bebida','9','120'], ['Refrigerante lata','bebida','7','150'],
    ['Cerveja long neck','bebida','12','180'], ['Combo pós-jogo (4 cervejas + porção)','combo','89',null],
    ['Porção de batata frita','alimento','35',null], ['Aluguel de colete (jogo)','servico','20',null], ['Bola oficial (aluguel)','equipamento','15',null]
  ];
  posts_data text[][] := array[
    ['aviso','Lembrete: chegue 10 minutos antes do horário para aquecer e liberar a quadra no tempo certo.'],
    ['promocao','Terças e quintas antes das 17h com 20% de desconto em todas as quadras. Reserve pelo app!'],
    ['evento','Inscrições abertas para o torneio do mês. Vagas limitadas, garanta a sua equipe.'],
    ['resultado','Parabéns ao time campeão do último torneio! Obrigado a todas as equipes que participaram.']
  ];
begin
  select id into v_manager from auth.users where lower(email) = lower(v_manager_email);
  if v_manager is null then
    raise exception 'Conta gestora % não encontrada em auth.users', v_manager_email;
  end if;
  if exists (select 1 from public.arenas where name = arenas_data[1][1]) then
    raise exception 'Os dados de demonstração já existem (arena "%"). Rode demo_seed_remove.sql antes.', arenas_data[1][1];
  end if;
  perform setseed(0.42);

  -- O gestor precisa de telefone para aparecer bem nos contatos (não altera se já houver).
  update public.profiles set phone = '(15) 99999-0000' where id = v_manager and (phone is null or phone = '');

  -- Clientes de demonstração (sem senha; não fazem login).
  for v_i in 1 .. array_length(customers_data, 1) loop
    v_user := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
      format('cliente%s@demo.arenahub.com.br', lpad(v_i::text, 2, '0')), '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', customers_data[v_i][1]),
      now() - interval '90 days', now(), '', '', '', '');
    -- O trigger on_auth_user_created cria o perfil; completa nome e telefone.
    insert into public.profiles (id, full_name, phone) values (v_user, customers_data[v_i][1], customers_data[v_i][2])
      on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone;
    v_customers := v_customers || v_user;
  end loop;

  alter table public.reservations disable trigger reservations_guard;

  for v_i in 1 .. array_length(arenas_data, 1) loop
    insert into public.arenas (name, city, state) values (arenas_data[v_i][1], arenas_data[v_i][2], arenas_data[v_i][3])
      returning id into v_arena;
    insert into public.arena_managers (arena_id, user_id, granted_by) values (v_arena, v_manager, v_manager)
      on conflict do nothing;

    -- Quadras
    for v_n in 1 .. array_length(courts_data, 1) loop
      if courts_data[v_n][1]::int = v_i then
        insert into public.courts (arena_id, name, sports, status, capacity, hourly_rate)
        values (v_arena, courts_data[v_n][2], string_to_array(courts_data[v_n][3], ','), 'ativa',
                courts_data[v_n][5]::int, courts_data[v_n][4]::numeric);
      end if;
    end loop;

    -- Reservas: 60 dias de histórico + 14 dias de agenda. Movimento maior à noite e no fim de semana.
    for v_court in select id, sports, hourly_rate from public.courts where arena_id = v_arena loop
      for v_day in select generate_series(v_today - 60, v_today + 14, interval '1 day')::date loop
        foreach v_slot slice 1 in array slots loop
          if random() < (case when v_slot[1] >= 18 then 0.62 when v_slot[1] >= 17 then 0.45 else 0.22 end)
                        * (case when extract(isodow from v_day) >= 6 then 1.25 else 1 end)
                        * (case when v_day > v_today then 0.75 else 1 end) then
            v_user := v_customers[1 + floor(random() * array_length(v_customers, 1))::int];
            -- Encerrada → concluída (ou cancelada); em andamento ou futura → confirmada (ou cancelada).
            if private.reservation_instant(v_day, make_time(v_slot[2], 0, 0)) <= now() then
              v_status := case when random() < 0.08 then 'cancelled' else 'completed' end;
            else
              v_status := case when random() < 0.05 then 'cancelled' else 'confirmed' end;
            end if;
            insert into public.reservations (court_id, arena_id, user_id, sport, reservation_date, start_time, end_time,
              hourly_rate, total_price, status, cancelled_at, cancelled_by, cancellation_reason, completed_at, created_at, updated_at)
            values (v_court.id, v_arena, v_user,
              v_court.sports[1 + floor(random() * array_length(v_court.sports, 1))::int],
              v_day, make_time(v_slot[1], 0, 0), make_time(v_slot[2], 0, 0),
              v_court.hourly_rate, v_court.hourly_rate * (v_slot[2] - v_slot[1]), v_status,
              case when v_status = 'cancelled' then least(now() - interval '1 hour',
                ((v_day - 1)::timestamp + interval '20 hours') at time zone 'America/Sao_Paulo') end,
              case when v_status = 'cancelled' then v_user end,
              case when v_status = 'cancelled' then 'Imprevisto do cliente' end,
              case when v_status = 'completed' then private.reservation_instant(v_day, make_time(v_slot[2], 0, 0)) end,
              least(now() - interval '2 hours', ((v_day - 3)::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo'),
              least(now() - interval '2 hours', ((v_day - 3)::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo'));
          end if;
        end loop;
      end loop;
    end loop;

    -- Produtos e vendas (o trigger de vendas define preço e baixa o estoque).
    for v_n in 1 .. array_length(products_data, 1) loop
      if v_n <= 6 or random() < 0.6 then
        insert into public.products (arena_id, name, category, price, stock, active, description)
        values (v_arena, products_data[v_n][1], products_data[v_n][2], products_data[v_n][3]::numeric,
                products_data[v_n][4]::int, true, null);
      end if;
    end loop;
    for v_product in select id, stock from public.products where arena_id = v_arena loop
      v_stock := v_product.stock;
      for v_day in select generate_series(v_today - 60, v_today, interval '1 day')::date loop
        if random() < 0.55 and (v_stock is null or v_stock > 40) then
          insert into public.sales (arena_id, product_id, quantity, unit_price, total, sold_by, sold_at)
          values (v_arena, v_product.id, 1 + floor(random() * 4)::int, 0, 0, v_manager,
                  least(now() - interval '1 hour',
                        (v_day::timestamp + make_interval(hours => 17 + floor(random() * 5)::int)) at time zone 'America/Sao_Paulo'));
          select stock into v_stock from public.products where id = v_product.id;
        end if;
      end loop;
    end loop;

    -- Campeonatos com equipes
    insert into public.championships (arena_id, name, sport, format, starts_on, ends_on, max_teams, entry_fee, status, description)
    values (v_arena, format('Copa %s', arenas_data[v_i][1]),
            (select sports[1] from public.courts where arena_id = v_arena order by id limit 1),
            'mata-mata', v_today + 10, v_today + 24, 8, 250, 'inscricoes',
            'Torneio mensal da arena. Premiação para o campeão e vice.')
    returning id into v_champ;
    for v_n in 1 .. 5 + floor(random() * 3)::int loop
      insert into public.championship_teams (championship_id, name)
      values (v_champ, (array['Os Boleiros','Resenha FC','Real Várzea','Unidos da Bola','Pé de Areia','Galáticos','Fúria','Rolo Compressor'])[v_n]);
    end loop;
    insert into public.championships (arena_id, name, sport, format, starts_on, ends_on, max_teams, entry_fee, status, description)
    values (v_arena, format('Liga de Inverno %s', arenas_data[v_i][1]),
            (select sports[1] from public.courts where arena_id = v_arena order by id desc limit 1),
            'pontos-corridos', v_today - 40, v_today - 5, 6, 180, 'concluido', null)
    returning id into v_champ;
    -- Inscrições só com status 'inscricoes': abre, inscreve e conclui.
    update public.championships set status = 'inscricoes' where id = v_champ;
    for v_n in 1 .. 6 loop
      insert into public.championship_teams (championship_id, name)
      values (v_champ, (array['Amigos do Gol','Bola na Rede','Os Craques','Time do Bairro','Sem Limites','Vira Lata FC'])[v_n]);
    end loop;
    update public.championships set status = 'concluido' where id = v_champ;

    -- Publicações
    for v_n in 1 .. array_length(posts_data, 1) loop
      insert into public.arena_posts (arena_id, author_id, kind, content, created_at)
      values (v_arena, v_manager, posts_data[v_n][1], posts_data[v_n][2], now() - make_interval(days => (v_n - 1) * 6 + floor(random() * 3)::int));
    end loop;
  end loop;

  alter table public.reservations enable trigger reservations_guard;

  raise notice 'Demo criada: % arenas, % quadras, % reservas, % produtos, % vendas, % campeonatos, % publicações',
    (select count(*) from public.arena_managers where user_id = v_manager),
    (select count(*) from public.courts c join public.arena_managers m on m.arena_id = c.arena_id and m.user_id = v_manager),
    (select count(*) from public.reservations r join public.arena_managers m on m.arena_id = r.arena_id and m.user_id = v_manager),
    (select count(*) from public.products p join public.arena_managers m on m.arena_id = p.arena_id and m.user_id = v_manager),
    (select count(*) from public.sales s join public.arena_managers m on m.arena_id = s.arena_id and m.user_id = v_manager),
    (select count(*) from public.championships c join public.arena_managers m on m.arena_id = c.arena_id and m.user_id = v_manager),
    (select count(*) from public.arena_posts a join public.arena_managers m on m.arena_id = a.arena_id and m.user_id = v_manager);
end;
$seed$;

commit;

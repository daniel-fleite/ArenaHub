-- ArenaHub — reservas de quadras (PROPOSTA, ainda não aplicada em nenhum ambiente).
-- Depende de: 20261026000100 (private.*), 20261027000200_courts.sql.
-- Não destrutiva: cria a tabela de reservas e adiciona uma UNIQUE (id, arena_id) em courts,
-- sempre válida porque courts.id já é único. Não altera dados.
--
-- Decisões confirmadas (detalhes em docs/RESERVATIONS.md):
--   • Toda reserva nasce 'confirmed'. Não há pendência nem expiração.
--   • Horas cheias, intervalo [início, fim) no mesmo dia, de 1 a 8 horas, hora local da arena
--     (America/Sao_Paulo, constante abaixo).
--   • Preço calculado pelo BANCO a partir de courts.hourly_rate no momento da criação; o valor
--     enviado pelo cliente/backend é ignorado. Quadra sem preço não pode ser reservada.
--   • Ocupam o horário: confirmed, completed. Libera: cancelled.
--   • Cancelamento (cliente ou gestão) somente antes do início.
--   • Criação exige telefone no perfil do responsável (profiles.phone com ao menos 10 dígitos);
--     o telefone continua opcional no perfil em geral.
--   • confirmed -> completed só depois do fim (executado pelo backend; ver docs).
--   • Datas de criação, cancelamento e conclusão são definidas pelo banco.
--   • Escrita só pelo backend. Pela Data API o usuário apenas LÊ.

begin;

-- Necessária para combinar igualdade em bigint (court_id) com sobreposição de intervalo.
create extension if not exists btree_gist with schema extensions;

-- Permite a FK composta (court_id, arena_id): a reserva não pode apontar para a quadra
-- de outra arena. courts.arena_id já não pode ser alterado (sem GRANT UPDATE).
-- Idempotente: só cria se ainda não existir em public.courts.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'courts_id_arena_id_key'
      and conrelid = 'public.courts'::regclass
  ) then
    alter table public.courts
      add constraint courts_id_arena_id_key unique (id, arena_id);
  end if;
end;
$$;

create table if not exists public.reservations (
  id bigint generated always as identity primary key,

  court_id bigint not null,
  arena_id bigint not null,
  -- RESTRICT: quadra (e, por cascata, arena) com reservas não pode ser excluída;
  -- use courts.status = 'inativa'. Preserva o histórico.
  constraint reservations_court_arena_fkey
    foreign key (court_id, arena_id) references public.courts (id, arena_id) on delete restrict,

  -- Responsável. Nome e telefone NÃO são copiados: o backend os lê de profiles só para
  -- gestores da arena. SET NULL preserva a reserva se a conta for excluída.
  user_id uuid references auth.users (id) on delete set null,

  sport text not null check (sport in ('society', 'futsal', 'futevolei', 'beach-tennis')),

  reservation_date date not null,
  start_time time(0) not null,
  end_time time(0) not null,
  -- Intervalo [início, fim): 19:00–20:00 e 20:00–21:00 não conflitam.
  -- O CASE evita erro técnico do tsrange quando fim <= início; a CHECK recusa a linha.
  period tsrange generated always as (
    case when end_time > start_time
      then tsrange(reservation_date + start_time, reservation_date + end_time, '[)')
    end
  ) stored,

  -- Preço acordado: preenchido pelo trigger com courts.hourly_rate × horas.
  -- Limite: numeric(10,2) vai até 99.999.999,99, o mesmo tipo de courts.hourly_rate.
  -- Com até 8 h, o total só estoura com valor/hora acima de 12.499.999,99 (ver docs).
  hourly_rate numeric(10, 2) not null check (hourly_rate >= 0),
  total_price numeric(10, 2) not null check (total_price >= 0),

  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled', 'completed')),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  completed_at timestamptz,

  notes text check (notes is null or char_length(notes) <= 500),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Horas cheias, mesmo dia, fim depois do início, de 1 a 8 horas (24:00 permitido como fim).
  constraint reservations_time_window check (
    end_time > start_time
    and extract(minute from start_time) = 0 and extract(second from start_time) = 0
    and extract(minute from end_time) = 0 and extract(second from end_time) = 0
    and end_time - start_time between interval '1 hour' and interval '8 hours'
  ),
  constraint reservations_status_fields check (
    (status = 'cancelled') = (cancelled_at is not null)
    and (status = 'cancelled' or (cancelled_by is null and cancellation_reason is null))
    and (status = 'completed') = (completed_at is not null)
  ),

  -- Proteção contra sobreposição, válida também para inserções concorrentes:
  -- a segunda transação espera a primeira e falha com 23P01 (exclusion_violation).
  constraint reservations_no_overlap
    exclude using gist (court_id with =, period with &&)
    where (status in ('confirmed', 'completed'))
);

create index if not exists reservations_user_idx
  on public.reservations (user_id, reservation_date desc);
create index if not exists reservations_arena_date_idx
  on public.reservations (arena_id, reservation_date);
-- Busca das reservas a concluir (confirmed com fim no passado).
create index if not exists reservations_to_complete_idx
  on public.reservations (reservation_date, end_time) where status = 'confirmed';

drop trigger if exists reservations_touch_updated_at on public.reservations;
create trigger reservations_touch_updated_at
  before update on public.reservations
  for each row execute function private.touch_updated_at();

-- Instante (com fuso) de um horário local da arena. Todas as arenas: America/Sao_Paulo.
create or replace function private.reservation_instant(d date, t time)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (d + t) at time zone 'America/Sao_Paulo';
$$;

-- Integridade de criação e transições.
--   INSERT: sempre 'confirmed'; responsável obrigatório e com telefone no perfil; quadra da arena,
--     ativa, que ofereça a modalidade e tenha preço; início no futuro. Preço e datas definidos
--     aqui (valores enviados são ignorados).
--   confirmed -> cancelled: só antes do início, por qualquer autor (cliente ou gestão);
--     exige cancelled_by; cancelled_at = now().
--   confirmed -> completed: só depois do fim; completed_at = now().
--   cancelled, completed: finais. Dados da reserva são imutáveis; user_id/cancelled_by só
--   podem virar NULL (efeito das FKs ON DELETE SET NULL).
create or replace function private.reservations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  court_row record;
  starts_at timestamptz;
  ends_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'confirmed' or new.cancelled_at is not null or new.cancelled_by is not null
       or new.cancellation_reason is not null or new.completed_at is not null then
      raise exception 'reservations: uma reserva nasce confirmada' using errcode = 'check_violation';
    end if;
    if new.user_id is null then
      raise exception 'reservations: responsável obrigatório' using errcode = 'check_violation';
    end if;
    -- Telefone exigido só para reservar; ao menos 10 dígitos (DDD + número).
    if not exists (
      select 1 from public.profiles
      where id = new.user_id
        and phone is not null
        and char_length(regexp_replace(phone, '\D', '', 'g')) between 10 and 13
    ) then
      raise exception 'reservations: complete o telefone no perfil antes de reservar'
        using errcode = 'check_violation';
    end if;
    select status, sports, hourly_rate into court_row
      from public.courts where id = new.court_id and arena_id = new.arena_id;
    if not found then
      raise exception 'reservations: a quadra não pertence a esta arena' using errcode = 'foreign_key_violation';
    end if;
    if court_row.status <> 'ativa' then
      raise exception 'reservations: quadra indisponível para reservas' using errcode = 'check_violation';
    end if;
    if not (new.sport = any (court_row.sports)) then
      raise exception 'reservations: modalidade não oferecida pela quadra' using errcode = 'check_violation';
    end if;
    if court_row.hourly_rate is null then
      raise exception 'reservations: quadra sem preço cadastrado' using errcode = 'check_violation';
    end if;
    if new.end_time > new.start_time
       and private.reservation_instant(new.reservation_date, new.start_time) <= now() then
      raise exception 'reservations: o horário escolhido já começou ou passou' using errcode = 'check_violation';
    end if;
    -- Preço confiável: sempre da quadra, no momento da criação.
    new.hourly_rate := court_row.hourly_rate;
    new.total_price := case when new.end_time > new.start_time
      then round(court_row.hourly_rate * extract(epoch from (new.end_time - new.start_time)) / 3600, 2)
      else 0 end;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if (new.court_id, new.arena_id, new.sport, new.reservation_date, new.start_time, new.end_time,
      new.hourly_rate, new.total_price, new.notes, new.created_at)
     is distinct from
     (old.court_id, old.arena_id, old.sport, old.reservation_date, old.start_time, old.end_time,
      old.hourly_rate, old.total_price, old.notes, old.created_at)
     or (new.user_id is not null and new.user_id is distinct from old.user_id) then
    raise exception 'reservations: os dados da reserva não podem ser alterados' using errcode = 'check_violation';
  end if;

  starts_at := private.reservation_instant(old.reservation_date, old.start_time);
  ends_at := private.reservation_instant(old.reservation_date, old.end_time);

  if new.status is distinct from old.status then
    if old.status <> 'confirmed' then
      raise exception 'reservations: reserva já finalizada (%)', old.status using errcode = 'check_violation';
    end if;
    if new.status = 'cancelled' then
      if new.cancelled_by is null then
        raise exception 'reservations: informe quem cancelou' using errcode = 'check_violation';
      end if;
      if now() >= starts_at then
        raise exception 'reservations: só é possível cancelar antes do início da reserva' using errcode = 'check_violation';
      end if;
      new.cancelled_at := now();
    elsif new.status = 'completed' then
      if now() < ends_at then
        raise exception 'reservations: só pode ser concluída depois do horário final' using errcode = 'check_violation';
      end if;
      new.completed_at := now();
    end if;
    return new;
  end if;

  -- Sem mudança de status: dados de cancelamento/conclusão não são reescritos.
  if new.cancelled_at is distinct from old.cancelled_at
     or new.completed_at is distinct from old.completed_at
     or new.cancellation_reason is distinct from old.cancellation_reason
     or (new.cancelled_by is not null and new.cancelled_by is distinct from old.cancelled_by) then
    raise exception 'reservations: dados de cancelamento/conclusão não podem ser alterados' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_guard on public.reservations;
create trigger reservations_guard
  before insert or update on public.reservations
  for each row execute function private.reservations_guard();

-- ── Privilégios (Data API) ──────────────────────────────────────────────────
-- Somente leitura para autenticados; nada para anon. Escrita apenas pelo backend.
revoke all on public.reservations from anon, authenticated;
grant select on public.reservations to authenticated;
-- Os privilégios padrão do Supabase concedem USAGE/SELECT/UPDATE em sequências novas a anon e
-- authenticated. Ninguém insere pela Data API, então a sequência do id não precisa deles.
-- O backend (dono) não é afetado; colunas identity não exigem privilégio na sequência.
do $$
declare
  seq text := pg_get_serial_sequence('public.reservations', 'id');
begin
  if seq is not null then
    execute format('revoke all on sequence %s from anon, authenticated', seq);
  end if;
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.reservations enable row level security;

drop policy if exists "reservations: próprias, da arena gerenciada ou admin" on public.reservations;
create policy "reservations: próprias, da arena gerenciada ou admin" on public.reservations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_platform_admin())
    or private.manages_arena(arena_id)
  );

-- Sem políticas de INSERT/UPDATE/DELETE. profiles continua sem leitura pelo gestor; nome e
-- telefone do responsável são expostos pelo backend apenas nas reservas da arena gerenciada.
-- Disponibilidade pública (só intervalos ocupados, sem dados pessoais) também via backend.

commit;

-- ArenaHub — solicitações de cadastro de arena.
-- Depende de 20261026000100 (schema private, private.touch_updated_at, private.is_platform_admin).
-- Não destrutiva: só cria objetos novos; não altera public.arenas.
--
-- Escrita somente pelo backend Express (papel dono das tabelas, transação única na aprovação).
-- Pela Data API o usuário autenticado apenas LÊ as próprias solicitações (admin lê todas).

begin;

create table if not exists public.arena_requests (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users (id) on delete cascade,

  name text not null check (char_length(btrim(name)) between 3 and 120),
  address text not null check (char_length(btrim(address)) between 5 and 200),
  city text not null check (char_length(btrim(city)) between 2 and 80),
  state text not null check (state ~ '^[A-Z]{2}$'),
  description text not null check (char_length(btrim(description)) between 20 and 2000),
  sports text[] not null check (cardinality(sports) between 1 and 20),
  contact_name text not null check (char_length(btrim(contact_name)) between 2 and 120),
  contact_email text not null check (char_length(contact_email) between 3 and 254 and contact_email like '%_@_%'),
  contact_phone text not null check (char_length(contact_phone) between 8 and 30),
  instagram text check (instagram is null or char_length(instagram) <= 60),

  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  -- UNIQUE: uma arena nunca é criada duas vezes a partir de solicitações.
  arena_id bigint unique references public.arenas (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Invariantes que valem SEMPRE, inclusive depois que as FKs anulam decided_by/arena_id
  -- (exclusão da conta do admin ou da arena). A exigência de decisor e arena no momento da
  -- decisão fica no trigger abaixo, para não bloquear essas exclusões legítimas.
  constraint arena_requests_decision_consistency check (
    (status = 'pending' and decided_at is null and decided_by is null and arena_id is null and rejection_reason is null)
    or (status = 'approved' and decided_at is not null and rejection_reason is null)
    or (status = 'rejected' and decided_at is not null and arena_id is null)
  )
);

-- Transições de status:
--   INSERT: sempre 'pending', sem dados de decisão.
--   UPDATE: requester_id, campos do formulário e created_at nunca mudam.
--   pending -> approved: exige decided_by, decided_at e arena_id.
--   pending -> rejected: exige decided_by e decided_at.
--   Decisão é final: approved/rejected não mudam de status, e os dados da decisão não são
--   reescritos. A única mudança aceita depois é decided_by/arena_id virarem NULL, que é o
--   efeito das FKs ON DELETE SET NULL (conta do admin ou arena excluída).
create or replace function private.arena_requests_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.decided_by is not null or new.decided_at is not null
       or new.arena_id is not null or new.rejection_reason is not null then
      raise exception 'arena_requests: uma solicitação nasce pendente e sem decisão'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- O que o solicitante enviou (e quem enviou) é imutável após a criação. requester_id não
  -- muda nem por FK: a exclusão da conta remove a solicitação (ON DELETE CASCADE).
  if (new.requester_id, new.name, new.address, new.city, new.state, new.description, new.sports,
      new.contact_name, new.contact_email, new.contact_phone, new.instagram, new.created_at)
     is distinct from
     (old.requester_id, old.name, old.address, old.city, old.state, old.description, old.sports,
      old.contact_name, old.contact_email, old.contact_phone, old.instagram, old.created_at) then
    raise exception 'arena_requests: os dados enviados pelo solicitante não podem ser alterados'
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'arena_requests: solicitação já decidida (%)', old.status
        using errcode = 'check_violation';
    end if;
    if new.decided_by is null or new.decided_at is null then
      raise exception 'arena_requests: decisão exige decided_by e decided_at'
        using errcode = 'check_violation';
    end if;
    if new.status = 'approved' and new.arena_id is null then
      raise exception 'arena_requests: aprovação exige arena_id'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if old.status <> 'pending' and (
       (new.decided_by is not null and new.decided_by is distinct from old.decided_by)
    or (new.arena_id is not null and new.arena_id is distinct from old.arena_id)
    or new.decided_at is distinct from old.decided_at
    or new.rejection_reason is distinct from old.rejection_reason
  ) then
    raise exception 'arena_requests: os dados de uma decisão não podem ser alterados'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists arena_requests_guard_status on public.arena_requests;
create trigger arena_requests_guard_status
  before insert or update on public.arena_requests
  for each row execute function private.arena_requests_guard_status();

create index if not exists arena_requests_requester_idx
  on public.arena_requests (requester_id, created_at desc);
create index if not exists arena_requests_pending_idx
  on public.arena_requests (created_at) where status = 'pending';

drop trigger if exists arena_requests_touch_updated_at on public.arena_requests;
create trigger arena_requests_touch_updated_at
  before update on public.arena_requests
  for each row execute function private.touch_updated_at();

-- Data API: somente leitura para autenticados; nada para anon.
revoke all on public.arena_requests from anon, authenticated;
grant select on public.arena_requests to authenticated;

alter table public.arena_requests enable row level security;

drop policy if exists "arena_requests: ler as próprias ou admin" on public.arena_requests;
create policy "arena_requests: ler as próprias ou admin" on public.arena_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or (select private.is_platform_admin()));

-- Sem políticas de INSERT/UPDATE/DELETE: criar, aprovar e rejeitar só pelo backend,
-- que valida o token e o papel admin a cada requisição.

commit;

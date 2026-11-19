-- ArenaHub — módulos do painel do gestor: produtos, vendas, campeonatos e publicações.
-- Depende de: 20261026000100 (private.*), 20261027000200_courts.sql, 20261028000100_reservations.sql.
-- Não destrutiva: só cria objetos novos. Escrita somente pelo backend (autorização nos
-- middlewares); pela Data API, apenas leitura para gestores vinculados e admin.

begin;

-- ── Produtos ────────────────────────────────────────────────────────────────
create table if not exists public.products (
  id bigint generated always as identity primary key,
  arena_id bigint not null references public.arenas (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  category text not null default 'outro'
    check (category in ('bebida', 'alimento', 'equipamento', 'combo', 'servico', 'outro')),
  description text check (description is null or char_length(description) <= 300),
  price numeric(10, 2) not null check (price >= 0),
  -- NULL = sem controle de estoque.
  stock integer check (stock is null or stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_arena_name_key unique (arena_id, name),
  constraint products_id_arena_id_key unique (id, arena_id)
);

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function private.touch_updated_at();

-- ── Vendas ──────────────────────────────────────────────────────────────────
create table if not exists public.sales (
  id bigint generated always as identity primary key,
  arena_id bigint not null,
  product_id bigint not null,
  -- Produto precisa ser da mesma arena; produto com vendas não pode ser excluído (desative).
  constraint sales_product_arena_fkey
    foreign key (product_id, arena_id) references public.products (id, arena_id) on delete restrict,
  -- Venda opcionalmente ligada a uma reserva da mesma arena.
  reservation_id bigint references public.reservations (id) on delete set null,
  quantity integer not null check (quantity between 1 and 999),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  total numeric(12, 2) not null check (total >= 0),
  sold_by uuid references auth.users (id) on delete set null,
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sales_arena_sold_at_idx on public.sales (arena_id, sold_at desc);
create index if not exists sales_product_idx on public.sales (product_id);

-- Preço e total sempre do produto vigente; baixa e devolução de estoque.
create or replace function private.sales_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_row record;
begin
  if tg_op = 'INSERT' then
    select price, stock, active into product_row
      from public.products where id = new.product_id and arena_id = new.arena_id
      for update;
    if not found then
      raise exception 'sales: produto não pertence a esta arena' using errcode = 'foreign_key_violation';
    end if;
    if not product_row.active then
      raise exception 'sales: produto inativo' using errcode = 'check_violation';
    end if;
    if product_row.stock is not null and product_row.stock < new.quantity then
      raise exception 'sales: estoque insuficiente' using errcode = 'check_violation';
    end if;
    if new.reservation_id is not null and not exists (
      select 1 from public.reservations where id = new.reservation_id and arena_id = new.arena_id
    ) then
      raise exception 'sales: reserva não pertence a esta arena' using errcode = 'foreign_key_violation';
    end if;
    new.unit_price := product_row.price;
    new.total := product_row.price * new.quantity;
    new.created_at := now();
    if new.sold_at is null or new.sold_at > now() then
      new.sold_at := now();
    end if;
    if product_row.stock is not null then
      update public.products set stock = stock - new.quantity where id = new.product_id;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Vendas são imutáveis; só o FK ON DELETE SET NULL pode anular reservation_id/sold_by.
    if (new.arena_id, new.product_id, new.quantity, new.unit_price, new.total, new.sold_at, new.created_at)
       is distinct from
       (old.arena_id, old.product_id, old.quantity, old.unit_price, old.total, old.sold_at, old.created_at)
       or (new.reservation_id is not null and new.reservation_id is distinct from old.reservation_id)
       or (new.sold_by is not null and new.sold_by is distinct from old.sold_by) then
      raise exception 'sales: vendas não podem ser alteradas; estorne e registre de novo'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- DELETE (estorno): devolve o estoque.
  update public.products set stock = stock + old.quantity
    where id = old.product_id and stock is not null;
  return old;
end;
$$;

drop trigger if exists sales_guard on public.sales;
create trigger sales_guard
  before insert or update or delete on public.sales
  for each row execute function private.sales_guard();

-- ── Campeonatos ─────────────────────────────────────────────────────────────
create table if not exists public.championships (
  id bigint generated always as identity primary key,
  arena_id bigint not null references public.arenas (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 3 and 100),
  sport text not null check (sport in ('society', 'futsal', 'futevolei', 'beach-tennis')),
  format text not null check (format in ('mata-mata', 'grupos-mata-mata', 'pontos-corridos')),
  starts_on date not null,
  ends_on date,
  max_teams integer not null check (max_teams between 2 and 64),
  entry_fee numeric(10, 2) check (entry_fee is null or entry_fee >= 0),
  status text not null default 'inscricoes' check (status in ('inscricoes', 'andamento', 'concluido')),
  description text check (description is null or char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint championships_dates check (ends_on is null or ends_on >= starts_on),
  constraint championships_arena_name_key unique (arena_id, name)
);

create index if not exists championships_arena_idx on public.championships (arena_id, starts_on desc);

drop trigger if exists championships_touch_updated_at on public.championships;
create trigger championships_touch_updated_at
  before update on public.championships
  for each row execute function private.touch_updated_at();

create table if not exists public.championship_teams (
  id bigint generated always as identity primary key,
  championship_id bigint not null references public.championships (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  created_at timestamptz not null default now(),
  constraint championship_teams_name_key unique (championship_id, name)
);

-- Limite de equipes e inscrições só com status 'inscricoes'.
create or replace function private.championship_teams_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  champ record;
  current_count integer;
begin
  select status, max_teams into champ from public.championships where id = new.championship_id for update;
  if not found then
    raise exception 'championship_teams: campeonato inexistente' using errcode = 'foreign_key_violation';
  end if;
  if champ.status <> 'inscricoes' then
    raise exception 'championship_teams: inscrições encerradas' using errcode = 'check_violation';
  end if;
  select count(*) into current_count from public.championship_teams where championship_id = new.championship_id;
  if current_count >= champ.max_teams then
    raise exception 'championship_teams: limite de equipes atingido' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists championship_teams_guard on public.championship_teams;
create trigger championship_teams_guard
  before insert on public.championship_teams
  for each row execute function private.championship_teams_guard();

-- ── Publicações (Arena Social) ──────────────────────────────────────────────
create table if not exists public.arena_posts (
  id bigint generated always as identity primary key,
  arena_id bigint not null references public.arenas (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  kind text not null default 'aviso' check (kind in ('aviso', 'promocao', 'evento', 'resultado')),
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists arena_posts_arena_idx on public.arena_posts (arena_id, created_at desc);

-- ── Privilégios e RLS (Data API: só leitura para gestor vinculado/admin) ─────
do $$
declare
  t text;
  seq text;
begin
  foreach t in array array['products', 'sales', 'championships', 'championship_teams', 'arena_posts'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    seq := pg_get_serial_sequence('public.' || t, 'id');
    if seq is not null then
      execute format('revoke all on sequence %s from anon, authenticated', seq);
    end if;
  end loop;
end;
$$;

drop policy if exists "products: gestor vinculado ou admin" on public.products;
create policy "products: gestor vinculado ou admin" on public.products
  for select to authenticated
  using ((select private.is_platform_admin()) or private.manages_arena(arena_id));

drop policy if exists "sales: gestor vinculado ou admin" on public.sales;
create policy "sales: gestor vinculado ou admin" on public.sales
  for select to authenticated
  using ((select private.is_platform_admin()) or private.manages_arena(arena_id));

drop policy if exists "championships: gestor vinculado ou admin" on public.championships;
create policy "championships: gestor vinculado ou admin" on public.championships
  for select to authenticated
  using ((select private.is_platform_admin()) or private.manages_arena(arena_id));

drop policy if exists "championship_teams: gestor vinculado ou admin" on public.championship_teams;
create policy "championship_teams: gestor vinculado ou admin" on public.championship_teams
  for select to authenticated
  using (exists (
    select 1 from public.championships c
    where c.id = championship_id
      and ((select private.is_platform_admin()) or private.manages_arena(c.arena_id))
  ));

drop policy if exists "arena_posts: gestor vinculado ou admin" on public.arena_posts;
create policy "arena_posts: gestor vinculado ou admin" on public.arena_posts
  for select to authenticated
  using ((select private.is_platform_admin()) or private.manages_arena(arena_id));

commit;

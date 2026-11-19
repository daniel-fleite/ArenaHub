# Perfis e permissões

## Estrutura

| Objeto | Função |
|---|---|
| `public.profiles` | 1:1 com `auth.users.id`; `full_name`, `phone`. Criado por trigger no cadastro e por backfill para contas existentes. E-mail continua só no Supabase Auth. |
| `public.platform_admins` | Quem é administrador da plataforma. Sem política de escrita: só SQL privilegiado concede. |
| `public.arena_managers` | N:N gestor ↔ arena (`arena_id`, `user_id`, PK composta). Sem escrita pela Data API. |
| `private.is_platform_admin()`, `private.manages_arena(id)` | Funções `SECURITY DEFINER`, somente leitura, baseadas em `auth.uid()`; evitam recursão de RLS. Schema `private` não é exposto pela API. |

Papéis são derivados, nunca gravados no perfil: `athlete` = tem perfil; `manager` = tem vínculo em `arena_managers`; `admin` = está em `platform_admins`. Assim uma pessoa pode acumular papéis, e editar o próprio perfil não altera nenhum deles (só `full_name` e `phone` têm `GRANT UPDATE`).

### RLS

- `profiles`: ler o próprio (ou admin); editar só o próprio, apenas `full_name`/`phone`. Sem insert/delete pelo cliente.
- `platform_admins`, `arena_managers`: ler a própria linha (ou admin). Nenhuma escrita.
- `arenas`: leitura pública; criar/remover só admin; editar (apenas `name`, `city`, `state`) admin ou gestor vinculado. `anon` só lê; privilégios padrão amplos são revogados.
  Atenção: hoje a Data API nega toda leitura de `arenas` (RLS sem políticas); após a migração, a leitura passa a ser pública, o que é o comportamento desejado para o catálogo.

### Backend Express

- `requireAuth` valida o Bearer em `SUPABASE_URL/auth/v1/user` com a chave pública.
- `GET /api/me`, `PATCH /api/me` (só nome/telefone; 404 se não houver perfil).
- `POST`/`DELETE /api/arenas` exigem admin; `PUT /api/arenas/:id` exige admin ou gestor vinculado. Leituras continuam públicas.
- O backend usa `pg` com `DATABASE_URL` (papel dono das tabelas, que ignora RLS): a autorização das rotas Express é feita pelos middlewares, não pela RLS.

## Ordem de aplicação (pendente — nada foi aplicado no Supabase remoto)

0. Verificado em 26/10/2026: `arenas.id` é `bigint`; RLS já ativa (`relforcerowsecurity = false`); nenhuma política em `arenas`. Como o CRUD do Express funciona com RLS ativa e sem políticas, o papel da `DATABASE_URL` já ignora RLS. Ainda não verificado: se `arenas.id` usa `identity` ou `serial` (afeta INSERT pela Data API, ver Pendências).
1. `supabase/migrations/20261026000100_profiles_roles_arena_managers.sql`
2. `supabase/migrations/20261026000200_arenas_rls.sql`

Aplique com `supabase db push` (projeto vinculado) ou colando cada arquivo, na ordem, no SQL Editor. As migrações só criam objetos; os únicos `drop ... if exists` removem os próprios triggers/políticas destas migrações para permitir reexecução.

## Concessão do administrador inicial

Nunca por formulário, cadastro ou metadado editável pelo usuário.

1. A pessoa cria a conta normalmente e confirma o e-mail.
2. Confirme a identidade por um canal fora do app (ex.: contato direto) e localize a conta pelo e-mail no painel **Authentication → Users**, conferindo o UUID.
3. Um responsável com acesso ao projeto executa no **SQL Editor** (papel `postgres`):
   ```sql
   insert into public.platform_admins (user_id, granted_by, note)
   select id, '<quem concedeu>', '<motivo/ticket>'
   from auth.users
   where id = '<uuid conferido>' and email = '<email conferido>'
   on conflict (user_id) do nothing
   returning user_id;
   ```
   Deve retornar exatamente uma linha.
4. Revogar: `delete from public.platform_admins where user_id = '<uuid>';`

Vínculos de gestor seguem o mesmo caminho por enquanto (até existir o fluxo de aprovação):
```sql
insert into public.arena_managers (arena_id, user_id) values (<id da arena>, '<uuid>') on conflict do nothing;
```

## Como testar

1. Configure `backend/.env` (ver `backend/.env.example`) e `VITE_API_URL` no frontend; rode `npm run dev` em `backend/`.
2. Conta comum: `/perfil` mostra só "Atleta"; `PUT/POST/DELETE /api/arenas` com o token → 403; sem token → 401.
3. `PATCH /api/me` com `{ "name": "X Y", "roles": ["admin"] }` → nome muda, papéis não.
4. Vincule a conta a uma arena (SQL acima): `/api/me` passa a ter `manager` e a arena; `PUT /api/arenas/<essa>` → 200, outra arena → 403.
5. Conceda admin: `POST`/`DELETE /api/arenas` → 201/200; o menu mostra "Administração".
6. Data API (chave pública, sem login): `update arenas` via REST → bloqueado; `select` → permitido. Logado como comum: `insert into platform_admins` → negado; `update profiles set ...` em outro id → 0 linhas.

## Pendências

- Se `arenas.id` usar `serial` (default `nextval`), um admin inserindo pela Data API precisa de `USAGE` na sequência; o Express não é afetado. Verifique com `select column_default, is_identity from information_schema.columns where table_schema='public' and table_name='arenas' and column_name='id';`.
- Se, em vez de dono da tabela, o papel do backend depender de `BYPASSRLS` e isso mudar, o CRUD do Express passaria a ser filtrado por estas políticas (sem `auth.uid()`, toda escrita seria negada).

- Fluxos de aprovação de arenas, reservas e telas administrativas: não implementados.
- Endpoints `/api/admin/*`, `/api/arena-requests`, reservas: ainda inexistentes (o frontend mostra erro explícito).
- `ssl.rejectUnauthorized=false` no `pg` e ausência de rate limiting continuam pendentes.
- A validação de token faz uma chamada ao Supabase Auth por requisição; trocar por verificação JWKS local se a latência importar.
- `backend/pnpm-lock.yaml` está desatualizado em relação ao `package.json` (o `package-lock.json` está coerente).

## Solicitações de arena (etapa 3)

Migração pendente (aplicar depois das duas anteriores): `supabase/migrations/20261027000100_arena_requests.sql`.

- `public.arena_requests`: solicitante (`requester_id` → `auth.users`), dados do formulário, `status` (`pending`/`approved`/`rejected`), `decided_by`, `decided_at`, `rejection_reason`, `arena_id` (UNIQUE → uma arena por solicitação), `created_at`/`updated_at`. Restrição `arena_requests_decision_consistency` impede estados incoerentes (ex.: pendente com decisor).
- Data API: `authenticated` só faz SELECT das próprias (admin vê todas); `anon` nada; nenhuma política de escrita.
- Escrita apenas pelo Express. Aprovação em uma transação (`BEGIN` → `SELECT … FOR UPDATE` → INSERT `arenas` → INSERT `arena_managers` → UPDATE status → `COMMIT`; qualquer erro → `ROLLBACK`). Funciona com a conexão `pg` atual; se a `DATABASE_URL` usar o pooler em modo *transaction* (porta 6543), a transação continua válida porque roda num único cliente do pool.

| Endpoint | Acesso |
|---|---|
| `POST /api/arena-requests` | autenticado; nasce `pendente`; solicitante = dono do token |
| `GET /api/me/arena-requests` | autenticado; só as próprias |
| `GET /api/admin/arena-requests[?status=pendente\|aprovada\|rejeitada]` | admin |
| `GET /api/admin/arena-requests/:id` | admin |
| `POST /api/admin/arena-requests/:id/approve` | admin; 409 se já decidida |
| `POST /api/admin/arena-requests/:id/reject` `{ reason? }` | admin; 409 se já decidida |

Testes: `cd backend && npm test` (autorização e transições, com Auth e banco simulados; não acessam o Supabase).

Teste manual: conta comum envia em `/arenas/solicitar` e vê em `/minhas-solicitacoes`; tentar `POST /api/admin/arena-requests/<id>/approve` com o token dela → 403. Conta admin aprova em `/admin/solicitacoes/<id>`; a arena aparece em `/api/arenas` e o solicitante passa a ter `manager` em `/api/me`. Aprovar de novo → 409.

Limitações: upload de imagens não implementado (a solicitação é registrada sem elas e a interface avisa); a arena criada recebe só `name`, `city`, `state` (colunas existentes em `arenas`); não há notificação ao solicitante.

## Quadras (gestão de quadras, etapa 1: banco)

Migração pendente, aplicar depois de `20261027000100_arena_requests.sql`: `supabase/migrations/20261027000200_courts.sql`. Só cria `public.courts`; não altera tabelas existentes. Endpoints e frontend ainda não usam a tabela.

- Campos: `id` (identity), `arena_id` → `arenas` (`on delete cascade`), `name` (2–80, único por arena), `sports` (1–10 entre `society`, `futsal`, `futevolei`, `beach-tennis`), `status` (`ativa`/`manutencao`/`inativa`, padrão `ativa`), `capacity` (1–200 ou nulo), `hourly_rate` (`numeric(10,2)` ≥ 0 ou nulo), `created_at`, `updated_at` (trigger `private.touch_updated_at`).
- Índices: `courts_arena_name_key (arena_id, name)` e parcial `courts_active_by_arena_idx (arena_id) where status = 'ativa'`.

| Operação (Data API) | Quem |
|---|---|
| SELECT | `anon`: só quadras `ativa`. `authenticated`: `ativa`, ou todas das arenas que gerencia, ou todas se admin |
| INSERT | admin ou gestor vinculado à `arena_id` (colunas de dados apenas) |
| UPDATE | admin ou gestor vinculado (`USING` e `WITH CHECK`); `arena_id` não tem `GRANT UPDATE`, então ninguém move quadra de arena |
| DELETE | admin ou gestor vinculado |

Reservas (futuro): a FK deverá ser `court_id bigint not null references public.courts (id) on delete restrict`. Isso bloqueia excluir quadras (e, em cascata, arenas) que tenham reservas e preserva o histórico; quadras fora de uso passam a `inativa`.

### Quadras: endpoints (etapa 2: backend)

Dependem da migração `20261027000200_courts.sql` aplicada. O frontend ainda não usa estes endpoints.

| Endpoint | Acesso | Observações |
|---|---|---|
| `GET /api/arenas/:id/courts` | público | Só quadras `ativa` |
| `GET /api/manager/arenas` | autenticado | Arenas vinculadas ao token (admin: todas), cada uma com **todas** as quadras; sem vínculo → `[]` |
| `POST /api/arenas/:id/courts` | admin ou gestor vinculado | `201 { court }`; status padrão `ativa` |
| `PUT /api/arenas/:id/courts/:courtId` | admin ou gestor vinculado | Substitui `name`, `sports`, `status`, `capacity`, `hourlyRate` |
| `DELETE /api/arenas/:id/courts/:courtId` | admin ou gestor vinculado | `200 { court }` removida |

Corpo: `{ name, sports: SportId[], status?: 'ativa'|'manutencao'|'inativa', capacity?: 1–200 | null, hourlyRate?: ≥ 0, até 2 casas | null }`. `arena_id` vem só da URL; `arenaId`, `id` e datas no corpo são ignorados. A quadra precisa pertencer à arena da URL (senão 404), o que impede alcançar quadra de outra arena trocando o `courtId`.

Respostas: 400 validação/ID inválido, 401 sem sessão, 403 sem vínculo, 404 arena/quadra inexistente, 409 nome repetido na arena. Formato: `{ id, arenaId, name, sports, status, capacity?, hourlyRate?, createdAt, updatedAt }` (ids como string; `hourlyRate` como número).

Testes: `cd backend && npm test` (inclui `src/tests/courts.test.ts`).

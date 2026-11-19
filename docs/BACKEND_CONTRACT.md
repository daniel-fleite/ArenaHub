# Contrato do backend (proposta)

Documento de **proposta**. Nenhum código de `backend/` e nenhum esquema de banco foi alterado. Os endpoints marcados como **A IMPLEMENTAR** não existem hoje; o frontend já os consome por trás de `src/services/*` e mostra erro explícito enquanto eles não existirem. Nenhuma proteção descrita aqui está ativa: a segurança real precisa ser implementada no servidor.

## 1. Estado atual do backend

| Endpoint | Estado | Observação |
|---|---|---|
| `GET /api/health` | **Existe** | |
| `GET /api/arenas` | **Existe** | `{ message, arenas: Row[] }` (`SELECT *`). Hoje a tabela só tem `name`, `city`, `state` usados pelo código |
| `GET /api/arenas/:id` | **Existe** | `{ message, arena }`; 400 id inválido, 404 não encontrada |
| `POST /api/arenas` | **Existe, somente admin** | Cria `name`, `city`, `state` |
| `PUT /api/arenas/:id` | **Existe, admin ou gestor vinculado** | |
| `GET/PATCH /api/me` | **Existe** | Ver `docs/PERMISSIONS.md` |
| `POST /api/arena-requests`, `GET /api/me/arena-requests` | **Existe, autenticado** | Ver `docs/PERMISSIONS.md` |
| `/api/admin/arena-requests` (listar, detalhar, aprovar, rejeitar) | **Existe, somente admin** | Imagens ainda não suportadas |
| `POST /api/reservations`, `GET /api/me/reservations`, `POST /api/me/reservations/:id/cancel` | **Existe, autenticado** | Ver `docs/RESERVATIONS.md` |
| `GET /api/arenas/:id/availability` | **Existe, público** | Sem dados pessoais |
| `GET /api/manager/arenas/:id/reservations`, `POST …/:reservationId/cancel` | **Existe, gestor vinculado ou admin** | Inclui nome e telefone do responsável |
| `GET /api/manager/arenas/:id/dashboard?days=7\|30\|90` | **Existe, gestor vinculado ou admin** | Faturamento, ocupação, reservas, vendas |
| `/api/manager/arenas/:id/products`, `/sales`, `/championships` (+ `/teams`), `/posts` | **Existe, gestor vinculado ou admin** | CRUD; migração `20261111000100_manager_modules.sql` |
| `GET /api/arenas`, `GET /api/arenas/:id` | **Existe, público** | Só arenas ativas; incluem `courts` ativas com `hourly_rate` e `image_url` |
| `GET /api/admin/stats`, `GET /api/admin/arenas`, `PATCH /api/admin/arenas/:id`, `GET /api/admin/users`, `PATCH /api/admin/users/:id/status`, `POST/DELETE /api/admin/users/:id/arenas[/:arenaId]` | **Existe, somente admin** | Migração `20261119000100_admin_and_photos.sql`; contas suspensas recebem 403 em rotas autenticadas |
| `DELETE /api/arenas/:id` | **Existe, somente admin** | |

Pendências de segurança: `ssl.rejectUnauthorized=false`; a `DATABASE_URL` do `.env` enviado no ZIP deve ser considerada exposta (rotacionar).

## 2. Autenticação e papéis

- Supabase Auth emite o JWT; o frontend envia `Authorization: Bearer <token>`.
- A API **valida o JWT em toda rota protegida** (assinatura via JWKS do projeto, `exp`, `aud`) e **nunca confia** em papel enviado pelo cliente.
- Uma conta por pessoa. Papéis: `athlete` (padrão de toda conta), `manager` (derivado de vínculo com ao menos uma arena aprovada), `admin` (apenas provisionado no servidor/banco; **nenhum endpoint público ou formulário concede admin**).
- Autorização por recurso: gestor só acessa arenas em que tem vínculo (`arena_members`); atleta só acessa as próprias reservas e solicitações.

## 3. Modelos de dados sugeridos

- `profiles(id uuid = auth.users.id, name, phone, status 'ativo'|'suspenso', created_at)`
- `platform_admins(user_id)` (papel admin, fora do alcance de qualquer endpoint público)
- `arenas(id, name, address, city, state, description, image_url, status 'ativa'|'inativa', created_at)`
- `arena_members(arena_id, user_id, role 'manager')`
- `courts(id, arena_id, name, sports text[], hourly_rate numeric, capacity int)`
- `court_slots` ou regra de disponibilidade por quadra/dia/horário (a definir)
- `reservations(id, user_id, arena_id, court_id, sport, date, time, duration, total, status 'pendente'|'confirmada'|'cancelada'|'concluida', created_at)` com restrição que impeça sobreposição na mesma quadra
- `arena_requests(id, requester_id, name, address, city, state, description, sports text[], contact_name, contact_email, contact_phone, instagram, status 'pendente'|'aprovada'|'rejeitada', rejection_reason, decided_by, decided_at, created_at)`
- `arena_request_images(id, request_id, storage_path)` (Supabase Storage ou equivalente)

Regras: nova solicitação nasce `pendente`; rejeição exige `rejection_reason` (mín. 10 caracteres); aprovação cria a arena e o vínculo `arena_members` na mesma transação. Habilitar RLS nas tabelas do Supabase caso sejam expostas diretamente.

## 4. Endpoints a implementar

Formato de erro esperado: `{ "error": "mensagem" }` com o status HTTP apropriado.

### Conta
- `GET /api/me` → `{ account: { id, email, name, phone?, roles: Role[], managedArenas: {id,name}[] } }` (auth)
- `PATCH /api/me` `{ name, phone? }` → `{ account }` (auth)

### Catálogo (público)
- Evoluir `GET /api/arenas` e `GET /api/arenas/:id` para incluir `address, description, image_url, sports[]` e `courts[]` (`id, name, sports[], hourly_rate, capacity`)
- `GET /api/arenas/:id/availability?date=YYYY-MM-DD` → `{ courts: [{ courtId, slots: [{ time: "HH:mm", available }] }] }`

### Reservas (auth, atleta)
- `GET /api/me/reservations` → `{ reservations: Reservation[] }`
- `POST /api/reservations` `{ arenaId, courtId, sport, date, time, duration }` → `201 { reservation }`. O servidor valida horário no futuro, quadra/modalidade compatíveis e disponibilidade (409 em conflito) e **é a única fonte do status final**

### Solicitação de arena (auth)
- `POST /api/arena-requests` `{ name, address, city, state, description, sports[], contactName, contactEmail, contactPhone, instagram? }` → `201 { request }` com `status: "pendente"`
- `POST /api/arena-requests/:id/images` (multipart, campo `images`, até 5 arquivos de 5 MB, apenas imagem; somente o dono da solicitação)
- `GET /api/me/arena-requests` → `{ requests: ArenaRequest[] }`

### Administração (somente `admin`)
- `GET /api/admin/stats` → `{ stats: { arenas:{total,active}, requests:{pendente,aprovada,rejeitada}, users:{total,managers,suspended}, reservations:{total,thisMonth} } }`
- `GET /api/admin/arenas` → `{ arenas: PlatformArena[] }`
- `GET /api/admin/arena-requests?status=` → `{ requests }`; `GET /api/admin/arena-requests/:id` → `{ request }` (inclui `requesterName`, `requesterEmail`, `imageCount`)
- `POST /api/admin/arena-requests/:id/approve` → `{ request }` (409 se já decidida)
- `POST /api/admin/arena-requests/:id/reject` `{ reason }` → `{ request }` (400 sem motivo)
- `GET /api/admin/users` → `{ users: PlatformUser[] }`
- `PATCH /api/admin/users/:id/status` `{ status }` → `{ user }`
- `DELETE /api/admin/users/:id/arenas/:arenaId` → `{ user }` (revoga o vínculo de gestor)

### Gestor de arena (painel existente)
O painel atual (quadras, reservas, campeonatos, vendas, social, indicadores) ainda não tem endpoints. Quando criados, devem ser escopados por arena e autorizados por `arena_members`.

## 5. Requisitos de segurança

1. Validar JWT em todas as rotas protegidas e checar papéis/vínculos no servidor, a cada requisição.
2. Proteger `POST/PUT/DELETE /api/arenas` (hoje abertos).
3. Configurar CORS com a origem do frontend; ler `PORT` do ambiente; validar o certificado TLS do banco.
4. Validar e sanitizar todo input (tipos, tamanhos, enums); limitar tamanho e tipo de upload.
5. Aplicar rate limiting em autenticação e criação de solicitações/reservas.
6. Nunca aceitar papel, status final ou `requester_id` vindos do corpo da requisição.
7. Registrar auditoria das decisões administrativas (quem, quando, motivo).

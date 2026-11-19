# Reservas — modelagem

Migração **proposta, não aplicada em nenhum ambiente**: `supabase/migrations/20261028000100_reservations.sql` (depois de `20261027000200_courts.sql`). Backend e frontend ainda não usam a tabela. Enquanto não for aplicada, é revisada no próprio arquivo; **depois de aplicada, qualquer mudança deve ser uma nova migração corretiva**.

## Decisões definitivas

| Tema | Regra |
|---|---|
| Confirmação | Imediata, sem pagamento online. Toda reserva nasce `confirmed`. Não há pendência nem expiração. |
| Horários | Somente horas cheias; 1 a 8 horas; `[início, fim)` no mesmo dia (fim máximo 24:00). |
| Antecedência | Só exige início no futuro na criação. Sem antecedência mínima adicional nem máxima. |
| Preço | Calculado pelo banco a partir de `courts.hourly_rate` vigente. Valores enviados são ignorados. Quadra sem preço não pode ser reservada. |
| Cancelamento | Cliente **e** gestão: somente antes do início. Depois do início, não há cancelamento normal. |
| Conclusão | `confirmed → completed` depois do horário final, executada pelo backend (sem scheduler no projeto). |
| Contato | O gestor vê nome e telefone do responsável nas reservas das arenas que gerencia. |
| Telefone | Exigido na criação da reserva (≥ 10 dígitos). Continua opcional no perfil em geral. |
| Fuso | `America/Sao_Paulo` para todas as arenas nesta versão. Arenas em outros fusos exigirão configuração por arena (coluna de fuso em `arenas` e uso em `private.reservation_instant`). |

## Modelo

`public.reservations`: `court_id` + `arena_id` (FK composta para `courts (id, arena_id)`, `on delete restrict`), `user_id` (`auth.users`, `on delete set null`; obrigatório na criação), `sport`, `reservation_date`, `start_time`, `end_time`, `period` (gerado, `tsrange [início, fim)`), `hourly_rate`, `total_price`, `status`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `completed_at`, `notes`, `created_at`, `updated_at`.

A migração também: adiciona `courts_id_arena_id_key unique (id, arena_id)` em `courts` (sempre válida; não altera dados), habilita `btree_gist` em `extensions` e cria `private.reservation_instant(date, time)` (horário local → instante, `America/Sao_Paulo`).

## Status

| Status | Ocupa o horário | Transições permitidas |
|---|---|---|
| `confirmed` | sim | → `cancelled` (antes do início), → `completed` (depois do fim) |
| `completed` | sim | final |
| `cancelled` | não (libera) | final |

## Conflitos

`EXCLUDE USING gist (court_id WITH =, period WITH &&) WHERE status IN ('confirmed','completed')`. Protege também requisições simultâneas: a segunda transação espera a primeira e falha com `23P01`, que o backend deve devolver como **409**. O backend não deve depender de um `SELECT` prévio de disponibilidade.

## Integridade garantida pelo banco (trigger `private.reservations_guard`)

- **Criação**: status `confirmed`; responsável obrigatório e com telefone (≥ 10 dígitos) em `profiles`; quadra pertence à arena, está `ativa`, oferece a modalidade e tem preço; início no futuro; horas cheias e 1–8 h (CHECK). `hourly_rate`, `total_price`, `created_at` e `updated_at` são definidos pelo banco.
- **Cancelamento**: só antes do início, por qualquer autor; exige `cancelled_by`; `cancelled_at = now()` (valor enviado é ignorado).
- **Conclusão**: só depois do fim; `completed_at = now()`.
- **Imutáveis**: quadra, arena, modalidade, data, horários, preços, observação, criação e responsável (`user_id` e `cancelled_by` só podem virar NULL pelas FKs). Dados de cancelamento/conclusão não são reescritos. `cancelled` e `completed` são finais.
- **Exclusões**: quadra (e, por cascata, arena) com reservas não pode ser excluída — use `courts.status = 'inativa'`. Excluir a conta mantém a reserva com `user_id` nulo.

O trigger não conhece o papel de quem cancela: **o backend deve autorizar** (cliente só as próprias; gestor só as da arena vinculada; admin todas) e preencher `cancelled_by` com o usuário do token. Também deve validar as regras antes de gravar para responder com mensagens claras; o banco é a última barreira.

## O que o backend nunca aceita do cliente

`user_id` (vem do token), `hourly_rate`, `total_price`, `status`, `created_at`, `updated_at`, `cancelled_at`, `cancelled_by`, `completed_at`. `arena_id` é derivado da quadra/URL e validado pela FK composta.

## Telefone ausente

Antes de criar, o backend lê `profiles.phone` do usuário do token. Se estiver ausente ou com menos de 10 dígitos, responde **422** com mensagem como: "Complete o telefone no seu perfil para reservar." e um link para `/perfil`. O banco recusa a criação na mesma situação (`complete o telefone no perfil antes de reservar`).

## Conclusão automática (estratégia para o backend)

Não existe scheduler no projeto. O backend executa, de forma **idempotente**:

```sql
UPDATE public.reservations SET status = 'completed'
WHERE status = 'confirmed'
  AND private.reservation_instant(reservation_date, end_time) <= now();
```

- Quando: no início de toda listagem que mostra status (minhas reservas, reservas da arena, admin), na mesma requisição e antes do `SELECT`. Pode ser restrita ao escopo listado (`AND user_id = $1` ou `AND arena_id = $1`).
- Segura: só altera linhas já encerradas; executar de novo não muda nada (validado: segunda execução afeta 0 linhas); o trigger impede concluir antes do fim.
- Limite: é preguiçosa. Relatórios ou notificações que dependam do status sem uma listagem prévia exigirão um scheduler (timer no processo Express ou pg_cron). Enquanto isso, consultas que precisem do status real podem tratar `confirmed` com fim no passado como concluída.

## Dados pessoais

- `profiles`: `full_name` (obrigatório, pode ser vazio) e `phone` (opcional, 8–30 caracteres), editados pelo próprio usuário. RLS inalterada: cada um lê o próprio perfil (admin lê todos). O gestor **não** lê perfis pela Data API.
- Nome e telefone **não são copiados** para a reserva. O backend, depois de verificar o vínculo do gestor com a arena, consulta:
  ```sql
  SELECT r.*, p.full_name, p.phone
  FROM public.reservations r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.arena_id = $1;  -- arena já autorizada para o gestor do token
  ```
  e devolve apenas `full_name` e `phone` do responsável.
- Implicações: o gestor vê o contato atual; se a conta for excluída, a reserva fica sem contato. Copiar os dados preservaria o histórico, mas manteria dados pessoais após a exclusão da conta; por isso não foi adotado.
- Disponibilidade pública: apenas intervalos ocupados, sem dados pessoais, via backend.

## RLS e privilégios

- `anon`: sem acesso a `reservations`.
- `authenticated`: só `SELECT` — próprias, das arenas gerenciadas (`private.manages_arena`) ou todas (admin).
- Nenhum `INSERT/UPDATE/DELETE` pela Data API, nem para admin. Escrita só pelo backend, que ignora a RLS e autoriza explicitamente.
- Sequência do `id` (`public.reservations_id_seq`): a migração revoga todos os privilégios de `anon` e `authenticated`, que o Supabase concede por padrão a sequências novas. Como ninguém insere pela Data API, eles não são necessários; o backend (dono) não é afetado.

## Limite de valores

`hourly_rate` e `total_price` usam `numeric(10,2)` (até 99.999.999,99), o mesmo tipo de `courts.hourly_rate`. Mantido por ser suficiente para preços reais: o total só ultrapassa o limite se o valor/hora passar de 12.499.999,99 (× 8 h). Nesse caso o banco recusa com `22003` (valor fora do intervalo) e nada é gravado. O backend pode tratar `22003` como 422. Ampliar exigiria nova migração em `courts` e `reservations`.

## Impacto nos endpoints existentes de exclusão

Com reservas, a FK `reservations_court_arena_fkey` (`on delete restrict`) faz o banco recusar exclusões com **`23503`** (foreign_key_violation). Hoje esses endpoints respondem **500** genérico nesse caso. Na etapa do backend de reservas, antes de existirem reservas reais:

| Endpoint | Hoje | Deverá responder |
|---|---|---|
| `DELETE /api/arenas/:id/courts/:courtId` (`courtService.deleteCourt`) | 500 "Erro interno ao excluir a quadra." | **409** "Esta quadra tem reservas e não pode ser excluída. Altere a situação para Inativa." |
| `DELETE /api/arenas/:id` (`arenaController.deleteArena`, admin) | 500 "Erro interno ao deletar a arena." | **409** "Esta arena tem quadras com reservas e não pode ser excluída. Inative as quadras." |

A conversão deve olhar o código `23503` **e** a constraint (`reservations_court_arena_fkey`), para não confundir com outras FKs. O frontend de Quadras já exibe a mensagem do servidor para erros com corpo `{ error }`.

## Testes locais

`supabase/tests/reservations.pglite.mjs` aplica as cinco migrações em sequência no PGlite e verifica: criação confirmada e preço do banco; datas enviadas ignoradas; quadra sem preço, inativa, sem modalidade e de outra arena; telefone ausente ou curto; início no passado, horários não cheios e duração; sobreposição e consecutivas; cancelamento antes/depois do início por cliente, gestor e admin; conclusão antes/depois do fim e idempotência do lote; transições inválidas; imutabilidade; exclusões; RLS por papel; gestor sem acesso a perfis; consulta de contato restrita à arena.

Limitações do PGlite: **uma única conexão — concorrência real não testada** (garantida pela `EXCLUDE`; testar no backend com duas conexões); papéis e `auth.uid()` simulados; não substitui teste no Supabase.

## Pontos em aberto

1. Cancelamento após o início (no-show, chuva): hoje impossível por qualquer pessoa. Se a gestão precisar registrar isso, será um novo status ou fluxo administrativo, em nova migração.
2. Política de reembolso/cobrança: fora do escopo (sem pagamento online).

## Backend (etapa 1) — endpoints implementados

Erros no formato `{ error }`; o backend nunca usa `user_id`, preço, status, papel ou datas enviados pelo cliente.

| Endpoint | Acesso | Resposta |
|---|---|---|
| `POST /api/reservations` `{ arenaId, courtId, sport, date, time: "HH:00", duration: 1–8, notes? }` | autenticado | `201 { reservation }` |
| `GET /api/me/reservations` | autenticado (só as próprias; conclui vencidas antes) | `{ reservations }` |
| `POST /api/me/reservations/:id/cancel` `{ reason? }` | dono, antes do início | `{ reservation }`; reserva de outro usuário → 404 |
| `GET /api/arenas/:id/availability?date=AAAA-MM-DD` | público | `{ courts: [{ courtId, slots: [{ time, available }], busy: [{ start, end }] }] }` — sem dados pessoais; só quadras ativas com preço; horários 06:00–22:00 como a tela atual |
| `GET /api/manager/arenas/:id/reservations?date=&status=` | gestor vinculado ou admin | `{ reservations }` com `customer: { name, phone }`; conclui vencidas antes |
| `POST /api/manager/arenas/:id/reservations/:reservationId/cancel` `{ reason? }` | gestor vinculado ou admin, antes do início | `{ reservation }` |

`reservation`: `{ id, arenaId, arenaName, courtId, courtName, sport, date, time, endTime, duration, hourlyRate, total, status: 'confirmada'|'cancelada'|'concluida', notes?, cancelledAt?, cancellationReason?, canCancel, createdAt }` (compatível com o tipo `Reservation` do frontend).

Status HTTP: 400 entrada inválida; 401 sem sessão; 403 sem vínculo com a arena; 404 quadra/reserva não encontrada no escopo; 409 conflito de horário (`23P01`), cancelamento após o início ou reserva encerrada; 422 telefone ausente/inválido, quadra inativa/sem preço/sem modalidade, início já passado (`23514` traduzido), valor fora do limite (`22003`).

Exclusões existentes: `DELETE /api/arenas/:id/courts/:courtId` e `DELETE /api/arenas/:id` devolvem **409** quando `23503` vem de `reservations_court_arena_fkey`.

Testes: `cd backend && npm test` (`src/tests/reservations.test.ts`, com banco simulado). O SQL do service também foi executado contra as migrações reais no PGlite.

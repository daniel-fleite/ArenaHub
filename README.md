# ArenaHub

Plataforma para descobrir arenas esportivas, reservar quadras e gerenciar arenas (society, futsal, futevôlei e beach tennis).

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 (raiz do projeto)
- **Backend:** Express + TypeScript (`backend/`)
- **Banco e autenticação:** Supabase (PostgreSQL + Supabase Auth)

## Áreas

| Área | Rotas |
|---|---|
| Autenticação | `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha` |
| Pública / atleta | `/`, `/arenas`, `/arenas/:id`, `/reservar/:arenaId`, `/minhas-reservas`, `/perfil` |
| Solicitação de arena | `/arenas/solicitar`, `/minhas-solicitacoes` |
| Gestor de arena | `/gestor/quadras`, `/gestor/reservas`, `/gestor/campeonatos`, `/gestor/vendas`, `/gestor/social`, `/gestor/indicadores` |
| Administração | `/admin`, `/admin/solicitacoes`, `/admin/arenas`, `/admin/usuarios`, `/admin/indicadores` |

## Rodando localmente

Frontend (porta 8443):

```bash
pnpm install
cp .env.example .env.local   # preencha as variáveis do Supabase e VITE_API_URL
pnpm dev
```

Backend (porta 3000):

```bash
cd backend
npm install
cp .env.example .env         # DATABASE_URL (Session pooler), SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Verificações:

```bash
pnpm typecheck && pnpm test && pnpm build
cd backend && npm run typecheck && npm test && npm run build
```

## Banco de dados

As migrações em `supabase/migrations/` definem o schema (aplicar em ordem no SQL Editor do Supabase).
`supabase/seed/` traz dados de demonstração (`demo_seed.sql`, removíveis com `demo_seed_remove.sql`) e fotos de exemplo das arenas (`arena_photos.sql`).

## Documentação

- [`docs/DEPLOY.md`](docs/DEPLOY.md) — publicar no Vercel (frontend) e Render (backend)
- [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) — perfis, papéis, RLS e administrador inicial
- [`docs/RESERVATIONS.md`](docs/RESERVATIONS.md) — regras de reservas
- [`docs/BACKEND_CONTRACT.md`](docs/BACKEND_CONTRACT.md) — endpoints da API
- [`docs/AUTH_SETUP.md`](docs/AUTH_SETUP.md) — configuração do Supabase Auth

> Nunca coloque `service_role`, senha do banco ou outros segredos nas variáveis `VITE_*`: elas vão para o navegador.

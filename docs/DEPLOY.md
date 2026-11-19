# Colocar o ArenaHub no ar (Vercel + Render + Supabase)

Frontend (React/Vite) no **Vercel**, backend (Express) no **Render**, banco e autenticação no **Supabase**.
Arquivos de configuração já no projeto: `vercel.json` (raiz) e `render.yaml` (raiz, aponta para `backend/`).

## 0. Pré-requisitos

1. **Repositório no GitHub** com o projeto (Vercel e Render publicam a partir dele). Nenhum `.env` é versionado: o `.gitignore` ignora `.env`, `.env.local` e `backend/.env`.
2. **Senha do banco e chaves** à mão (painel do Supabase). Nunca use a `service_role` no frontend.

## 1. Banco (Supabase) — migrações pendentes

No **SQL Editor**, como `postgres`, verifique o que já existe e aplique na ordem só o que faltar:

| Migração | Situação conhecida |
|---|---|
| `20261026000100_profiles_roles_arena_managers.sql` | aplicada |
| `20261026000200_arenas_rls.sql` | aplicada |
| `20261027000100_arena_requests.sql` | aplicada |
| `20261027000200_courts.sql` | aplicada |
| `20261028000100_reservations.sql` | aplicada |
| `20261111000100_manager_modules.sql` | aplicada — produtos, vendas, campeonatos, publicações |
| `20261119000100_admin_and_photos.sql` | pendente até ser aplicada — foto/situação/cadastro das arenas e suspensão de contas |

Conferência rápida antes de aplicar a última: `select to_regclass('public.products');` deve retornar `null`.

**Fotos das arenas:** depois da última migração, rode `supabase/seed/arena_photos.sql` (preenche só arenas sem foto; créditos e licenças no próprio arquivo). Fotos também podem ser trocadas em `/admin/arenas`.

**Dados de demonstração (opcional):** depois das migrações, rode `supabase/seed/demo_seed.sql`. Ele vincula 10 arenas à conta `daniel@arenahub.com` (troque `v_manager_email` no topo do arquivo se quiser outra). Para remover: `supabase/seed/demo_seed_remove.sql`.

## 2. Backend no Render

1. Render → **New → Blueprint** → selecione o repositório. O `render.yaml` cria o serviço `arenahub-api` (Node 24, `rootDir: backend`, build `npm ci --include=dev && npm run build`, start `npm start`, health check `/api/health`).
2. Preencha as variáveis marcadas como secretas:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | connection string do **Session pooler** (Supabase → Connect → Session pooler), com a senha |
   | `SUPABASE_URL` | `https://<projeto>.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | chave **publishable/anon** |
   | `FRONTEND_ORIGIN` | URL do Vercel, ex.: `https://arenahub.vercel.app` (sem barra no fim; várias separadas por vírgula) |

   `NODE_ENV=production` já vem do blueprint: em produção o CORS aceita **somente** `FRONTEND_ORIGIN`.
3. Depois do deploy, `https://<servico>.onrender.com/api/health` deve responder `{"message": ...}`.

Observação: no plano gratuito o Render hiberna após ~15 min sem uso; a primeira requisição depois disso leva até ~1 min. Para a apresentação, abra o site alguns minutos antes (ou use um plano pago).

## 3. Frontend no Vercel

1. Vercel → **Add New → Project** → importe o repositório (raiz do projeto). O `vercel.json` define `pnpm install`, `pnpm build`, saída `dist` e o redirecionamento de rotas para `index.html` (necessário para `/gestor`, `/admin` etc.).
2. Variáveis de ambiente (Production):

   | Variável | Valor |
   |---|---|
   | `VITE_API_URL` | `https://<servico>.onrender.com` |
   | `VITE_SUPABASE_URL` | `https://<projeto>.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | chave publishable/anon |
   | `VITE_ENABLE_DEMO_DATA` | `false` |
   | `VITE_PREVIEW_WITHOUT_AUTH` | `false` |

3. Faça o deploy. Se a URL final for diferente da usada em `FRONTEND_ORIGIN`, atualize-a no Render.

## 4. Supabase Auth (URLs)

Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://<seu-app>.vercel.app`
- **Redirect URLs:** `https://<seu-app>.vercel.app/entrar` e `https://<seu-app>.vercel.app/redefinir-senha` (mantenha também os de `http://localhost:8443` para desenvolvimento).

Sem isso, os links de confirmação de cadastro e recuperação de senha apontam para o endereço errado.

## 5. Conferência final

1. Abrir o site, criar conta ou entrar.
2. `/perfil` mostra os papéis (Atleta, Gestor, Admin). Se aparecer "Não foi possível carregar suas permissões", verifique `VITE_API_URL`, `FRONTEND_ORIGIN` e o health check do Render.
3. Como gestor: `/gestor/indicadores`, `/gestor/reservas`, `/gestor/vendas`, `/gestor/campeonatos`, `/gestor/social`.
4. Como cliente (com telefone no perfil): reservar uma quadra em `/arenas` e cancelar em `/minhas-reservas`.

## Pendências conhecidas (não bloqueiam a apresentação)

- Upload de imagens das solicitações de arena e telas administrativas de estatísticas/usuários/arenas da plataforma ainda sem backend.
- Reserva "de balcão" pelo gestor para cliente sem conta não existe: "Nova reserva" abre o fluxo público de reserva com a conta do gestor.
- Sem rate limiting; `ssl.rejectUnauthorized=false` na conexão com o banco (o pooler do Supabase usa TLS, mas o certificado não é validado). Para validar, use o certificado CA do Supabase.
- Conclusão automática de reservas acontece ao listar (não há agendador).

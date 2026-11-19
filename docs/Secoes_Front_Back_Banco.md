# Seções a inserir acima da "14. Conclusão"

Sugestão de numeração: as novas seções viram 14, 15 e 16; Conclusão passa a 17, Estudos Futuros a 18 e Referências a 19 (lembre de atualizar o Sumário).

---

## 14. Front-end

O front-end do ArenaHub é a parte do sistema que o usuário vê e usa no navegador, tanto no computador quanto no celular. Foi desenvolvido com **React** e **TypeScript**, usando **Vite** para rodar e compilar o projeto, **Tailwind CSS** e CSS próprio para o visual e **React Router** para a navegação entre telas.

As telas seguem o protótipo feito no Figma e são divididas por tipo de usuário:

- **Área pública:** página inicial, lista de arenas e detalhes de cada arena.
- **Autenticação:** cadastro, login e recuperação de senha.
- **Área do atleta (B2C):** reservar quadra, minhas reservas, perfil e solicitação para cadastrar uma arena.
- **Área do gestor (B2B):** painel, quadras, reservas, vendas, campeonatos e mural social da arena.
- **Área do administrador:** análise de solicitações de arenas, usuários e indicadores.

O código fica organizado em pastas simples: `pages` (telas), `components` (peças reutilizáveis como botões e formulários), `layouts` (estrutura de cada área), `services` (comunicação com o servidor) e `routes` (rotas e proteção de acesso por perfil). O contexto de autenticação guarda quem está logado e libera ou bloqueia as telas conforme o perfil.

## 15. Back-end

O back-end é responsável pelas regras de negócio do sistema e pela comunicação entre o front-end e o banco de dados. Foi desenvolvido em **Node.js** com **Express** e **TypeScript**, no formato de uma API REST, em que o front-end envia requisições e recebe respostas em JSON.

A estrutura segue uma divisão em camadas, o que deixa o código mais fácil de entender e manter:

- **Rotas:** definem os endereços da API (arenas, quadras, reservas, solicitações de arena, gestor e dados do usuário logado).
- **Controllers:** recebem a requisição, validam os dados e devolvem a resposta.
- **Services:** concentram as regras de negócio, como impedir dois agendamentos no mesmo horário da mesma quadra.
- **Middleware de autenticação:** confere o login do usuário e o seu perfil (atleta, gestor ou administrador) antes de liberar cada rota.

A segurança é tratada com autenticação do usuário, controle de permissões por perfil e acesso ao banco apenas pelo servidor. Também há testes automatizados para as principais funcionalidades (reservas, quadras, solicitações e gestor).

## 16. Banco de Dados

O banco de dados é relacional (**PostgreSQL**) e está hospedado no **Supabase**, que também fornece o login e o cadastro de usuários. A estrutura é criada por arquivos de migração SQL versionados no repositório, o que permite recriar o banco do zero com facilidade.

As principais tabelas são:

| Tabela | Função |
|---|---|
| `profiles` | Dados do usuário e seu perfil de acesso |
| `platform_admins` | Administradores da plataforma |
| `arena_requests` | Solicitações de cadastro de novas arenas |
| `arenas` | Arenas cadastradas |
| `arena_managers` | Vínculo entre gestores e arenas |
| `courts` | Quadras de cada arena |
| `reservations` | Reservas (confirmada, cancelada ou concluída) |
| `products` e `sales` | Produtos do bar/lanchonete e vendas |
| `championships` e `championship_teams` | Campeonatos e times inscritos |
| `arena_posts` | Publicações do mural social da arena |

Os relacionamentos funcionam assim: uma arena possui várias quadras, cada quadra recebe várias reservas, e cada reserva pertence a um usuário. Um gestor pode administrar uma ou mais arenas.

Para proteger os dados, o banco usa **Row Level Security (RLS)**: cada usuário só acessa os registros que o seu perfil permite. Além disso, regras no próprio banco (restrições e verificações) garantem a integridade das informações, como o status válido das reservas, e consultas e visões de dados alimentam os relatórios do painel de BI.

# Configuração e validação do Supabase Auth

## Variáveis locais

Crie `.env.local` na raiz do frontend (não versionar) com:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_...>
VITE_ENABLE_DEMO_DATA=true
VITE_PREVIEW_WITHOUT_AUTH=false
```

A chave publishable é destinada ao cliente. Nunca use `service_role`, chave secreta nem senha do banco no frontend. O código ainda aceita `VITE_SUPABASE_ANON_KEY` como nome legado.

## URLs no painel Supabase

Em **Authentication → URL Configuration**:

- Site URL para desenvolvimento: `http://localhost:5173`
- Redirect URLs permitidas: `http://localhost:5173/entrar`
- Redirect URLs permitidas: `http://localhost:5173/redefinir-senha`

Se Vite iniciar em outra porta, atualize estas URLs para corresponder à origem usada. Em produção, cadastre também os caminhos equivalentes no domínio publicado.

O cadastro usa `/entrar` como retorno após confirmação do e-mail; recuperação usa `/redefinir-senha`. O envio e a entrega das mensagens dependem da configuração Auth/SMTP do projeto.

## Roteiro de teste manual

1. Execute `pnpm install` e `pnpm dev` após configurar `.env.local`.
2. Em `/cadastro`, crie uma conta com e-mail acessível. Se a confirmação estiver ativa, confirme pelo link recebido e volte à aplicação. Se estiver desativada, a sessão deverá iniciar logo após cadastro.
3. Atualize a página; o usuário deve continuar autenticado pela sessão persistida pelo SDK.
4. Faça logout pelo menu de usuário; tente abrir `/perfil` e confirme que volta para `/entrar`.
5. Entre novamente em `/entrar` usando as credenciais criadas.
6. Em `/recuperar-senha`, solicite a redefinição, abra o link recebido, defina nova senha em `/redefinir-senha` e teste login com a nova senha.
7. Gestor e admin devem permanecer sem acesso até que o backend implemente `/api/me`, valide o JWT e retorne papéis e vínculos confiáveis. A flag `VITE_PREVIEW_WITHOUT_AUTH` não deve ser ativada nesses testes.

## Limites de escopo e segurança

- Este frontend usa Supabase Auth para identidade e sessão. Não cria tabelas, perfis, papéis, vínculos, políticas RLS nem altera endpoints.
- A chamada de conta `/api/me` ainda não está implementada no backend. Portanto, login não concede automaticamente acesso a gestor ou admin.
- O backend atual mantém operações de escrita de arenas sem autenticação. Não o use com dados reais até validar JWT e autorização em cada operação.
- Não foi feito teste manual de cadastro, e-mail, login ou recuperação, pois ele exige interação com o projeto, uma conta de teste e configuração do provedor de e-mail.

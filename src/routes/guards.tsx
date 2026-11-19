import type { ReactNode } from "react"
import { Link, Navigate, Outlet, useLocation } from "react-router-dom"
import { Alert, LoadingBlock } from "@/components/common"
import { Button, Icon, type IconName } from "@/components/ui"
import { env } from "@/config/env"
import { useAuth } from "@/contexts/AuthContext"
import { AuthFrame } from "@/layouts/AuthLayout"
import type { Role } from "@/types"

/**
 * ATENÇÃO: estes guards só controlam o que a interface exibe (UX). Eles NÃO são um mecanismo
 * de segurança: qualquer dado ou ação protegida precisa ser autorizado pelo backend (token
 * Bearer validado no servidor, papéis e vínculos de arena consultados no banco).
 */

function GuardScreen({
  icon,
  title,
  children,
  actions,
}: {
  icon: IconName
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <AuthFrame>
      <div className="guard-screen">
        <div className="empty-icon">
          <Icon name={icon} className="size-6" />
        </div>
        <h1 className="auth-title">{title}</h1>
        <div className="guard-text">{children}</div>
        {actions && <div className="guard-actions">{actions}</div>}
      </div>
    </AuthFrame>
  )
}

export function RequireAuth() {
  const auth = useAuth()
  const location = useLocation()

  if (env.previewWithoutAuth) return <Outlet />
  if (auth.status === "loading") {
    return (
      <AuthFrame>
        <LoadingBlock label="Verificando sessão…" />
      </AuthFrame>
    )
  }
  if (auth.status === "unauthenticated") {
    // Logout pedido pelo usuário: vai para o início, o mesmo destino do signOut.
    if (auth.signedOutByUser) return <Navigate to="/" replace />
    if (!auth.configured) {
      return (
        <GuardScreen
          icon="user"
          title="Entre para continuar"
          actions={
            <>
              <Link className="button button-secondary" to="/entrar">
                Ir para o login
              </Link>
              <Link className="button button-ghost" to="/">
                Voltar ao site
              </Link>
            </>
          }
        >
          <p>Esta área exige uma conta, mas a autenticação ainda não está configurada neste ambiente.</p>
          <p>Ela depende da integração com o Supabase Auth e com a API do ArenaHub.</p>
        </GuardScreen>
      )
    }
    return <Navigate to="/entrar" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

export function RequireRole({ role }: { role: Exclude<Role, "athlete"> }) {
  const auth = useAuth()
  if (env.previewWithoutAuth) return <Outlet />

  const label = role === "admin" ? "administrativa" : "do gestor"
  if (auth.accountStatus === "loading" || auth.accountStatus === "idle") {
    return (
      <AuthFrame>
        <LoadingBlock label="Verificando permissões…" />
      </AuthFrame>
    )
  }
  if (auth.accountStatus === "error") {
    return (
      <GuardScreen
        icon="alert"
        title="Não foi possível verificar suas permissões"
        actions={
          <>
            <Button variant="secondary" onClick={auth.reloadAccount}>
              Tentar novamente
            </Button>
            <Link className="button button-ghost" to="/">
              Voltar ao site
            </Link>
          </>
        }
      >
        <Alert tone="error">{auth.accountError ?? "Falha ao consultar a conta."}</Alert>
      </GuardScreen>
    )
  }
  if (!auth.hasRole(role)) {
    return (
      <GuardScreen
        icon="shield"
        title={`Área ${label} restrita`}
        actions={
          <Link className="button button-secondary" to="/">
            Voltar ao site
          </Link>
        }
      >
        <p>Sua conta não possui permissão para acessar a área {label}.</p>
        {role === "manager" && (
          <p>
            Para gerenciar uma arena, <Link to="/arenas/solicitar">solicite o cadastro</Link> e aguarde a
            aprovação.
          </p>
        )}
      </GuardScreen>
    )
  }
  return <Outlet />
}

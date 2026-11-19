import { useNavigate } from "react-router-dom"
import { Button, Icon } from "@/components/ui"
import { useAuth } from "@/contexts/AuthContext"
import SidebarShell, { type ShellNavItem } from "./SidebarShell"

export const adminNav: ShellNavItem[] = [
  { to: "/admin", label: "Visão geral", icon: "home", group: "Plataforma", end: true },
  { to: "/admin/solicitacoes", label: "Solicitações", icon: "check", group: "Moderação" },
  { to: "/admin/arenas", label: "Arenas", icon: "arena", group: "Cadastros" },
  { to: "/admin/usuarios", label: "Usuários e gestores", icon: "community", group: "Cadastros" },
  { to: "/admin/indicadores", label: "Indicadores", icon: "chart", group: "Análises" },
]

/**
 * Área do administrador da PLATAFORMA. Visualmente distinta do painel do gestor de arena
 * (acento azul e faixa fixa), com navegação própria. A restrição de acesso real é do backend.
 */
export default function AdminLayout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  return (
    <SidebarShell
      navItems={adminNav}
      rootClassName="admin-theme"
      breadcrumbRoot="Administração"
      logoAlt="ArenaHub — Administração da plataforma"
      navLabel="Navegação administrativa"
      statusIcon="shield"
      statusTitle="Administrador"
      statusText={user?.email ?? "Sem sessão"}
      belowTopbar={
        <div className="admin-bar" role="note">
          <Icon name="shield" className="size-4" />
          <span>
            <strong>Administração da plataforma ArenaHub.</strong> Ações aqui afetam todas as arenas e
            usuários.
          </span>
        </div>
      }
      footerExtra={
        <Button variant="ghost" className="nav-item" onClick={() => navigate("/")}>
          <Icon name="home" />
          <span>Voltar ao site</span>
        </Button>
      }
    />
  )
}

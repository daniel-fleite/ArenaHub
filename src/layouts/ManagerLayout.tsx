import { useNavigate } from "react-router-dom"
import { Button, Icon } from "@/components/ui"
import { useAuth } from "@/contexts/AuthContext"
import SidebarShell, { type ShellNavItem } from "./SidebarShell"

// Mesmos itens, ordem, grupos e rótulos do painel original; só os destinos viraram rotas.
export const managerNav: ShellNavItem[] = [
  { to: "/gestor/quadras", label: "Quadras", icon: "arena", group: "Operação" },
  { to: "/gestor/reservas", label: "Reservas", icon: "calendar", group: "Operação" },
  { to: "/gestor/campeonatos", label: "Campeonatos", icon: "trophy", group: "Gestão" },
  { to: "/gestor/vendas", label: "Vendas & Combos", icon: "package", group: "Gestão" },
  { to: "/gestor/social", label: "Arena Social", icon: "community", group: "Comunidade" },
  { to: "/gestor/indicadores", label: "Indicadores", icon: "chart", group: "Análises" },
]

export default function ManagerLayout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  return (
    <SidebarShell
      navItems={managerNav}
      breadcrumbRoot="ArenaHub"
      logoAlt="ArenaHub — Gestão esportiva"
      navLabel="Navegação principal"
      statusTitle="Espaço de trabalho"
      statusText={user?.email ?? "Conta não conectada"}
      footerExtra={
        <Button variant="ghost" className="nav-item" onClick={() => navigate("/")}>
          <Icon name="home" />
          <span>Voltar ao site</span>
        </Button>
      }
    />
  )
}

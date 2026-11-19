import { useState, type ReactNode } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { Button, Icon, type IconName } from "@/components/ui"
import { DemoBanner, PreviewBanner } from "@/components/common"
import arenaLogo from "../../assets/arenaLogo-sidebar.png"
import arenaShortLogo from "../../assets/arenaShortLogo.png"

export interface ShellNavItem {
  to: string
  label: string
  icon: IconName
  group: string
  /** Só fica ativo na rota exata (ex.: a visão geral de /admin). */
  end?: boolean
}

/**
 * Shell com sidebar recolhível e gaveta no mobile, extraído do App.tsx original SEM mudar
 * o markup nem as classes CSS. Usado pelo painel do gestor e pela área administrativa.
 */
export default function SidebarShell({
  navItems,
  breadcrumbRoot,
  logoAlt,
  navLabel,
  rootClassName = "",
  statusIcon = "settings",
  statusTitle,
  statusText,
  belowTopbar,
  footerExtra,
}: {
  navItems: ShellNavItem[]
  breadcrumbRoot: string
  logoAlt: string
  navLabel: string
  rootClassName?: string
  statusIcon?: IconName
  statusTitle: string
  statusText: string
  belowTopbar?: ReactNode
  footerExtra?: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (item: ShellNavItem) =>
    item.end
      ? location.pathname === item.to
      : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  const current = navItems.find(isActive)

  const go = (to: string) => {
    navigate(to)
    setMobileOpen(false)
  }

  return (
    <div className={`app-shell ${rootClassName}`}>
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className={`sidebar ${collapsed ? "is-collapsed" : ""} ${
          mobileOpen ? "is-mobile-open" : ""
        }`}
      >
        <div className="brand">
          <img className="brand-logo-full" src={arenaLogo} alt={logoAlt} />
          <img
            className="brand-logo-compact"
            src={arenaShortLogo}
            alt=""
            aria-hidden="true"
          />
          <Button
            variant="icon"
            className="mobile-close"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="close" />
          </Button>
        </div>

        <nav className="main-nav" aria-label={navLabel}>
          {navItems.map((item, index) => {
            const showGroup = index === 0 || navItems[index - 1].group !== item.group
            const active = isActive(item)
            return (
              <div key={item.to}>
                {showGroup && <p className="nav-group">{item.group}</p>}
                <Button
                  variant="ghost"
                  className={`nav-item ${active ? "is-active" : ""}`}
                  onClick={() => go(item.to)}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Button>
              </div>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="workspace-status">
            <Icon name={statusIcon} />
            <div>
              <strong>{statusTitle}</strong>
              <span>{statusText}</span>
            </div>
          </div>
          {footerExtra}
          <Button
            variant="ghost"
            className="collapse-button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <Icon name="chevron" />
            <span>Recolher menu</span>
          </Button>
        </div>
      </aside>

      <div className="app-content">
        <DemoBanner />
        <PreviewBanner />
        <header className="topbar">
          <Button
            variant="icon"
            className="mobile-menu"
            aria-label="Abrir menu"
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" />
          </Button>
          <div className="breadcrumb">
            <span>{breadcrumbRoot}</span>
            <Icon name="chevron" />
            <strong>{current?.label ?? ""}</strong>
          </div>
        </header>
        {belowTopbar}
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

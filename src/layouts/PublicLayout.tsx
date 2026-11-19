import { useEffect, useRef, useState } from "react"
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Button, Icon } from "@/components/ui"
import { DemoBanner, PreviewBanner } from "@/components/common"
import { env } from "@/config/env"
import { useAuth } from "@/contexts/AuthContext"
import arenaLogo from "../../assets/arenaLogo-sidebar.png"

const links = [
  { to: "/arenas", label: "Explorar arenas" },
  { to: "/minhas-reservas", label: "Minhas reservas" },
  { to: "/arenas/solicitar", label: "Solicitar arena" },
]

export default function PublicLayout() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMobileOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) return event.key === "Escape" && setMenuOpen(false)
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    window.addEventListener("mousedown", close)
    window.addEventListener("keydown", close)
    return () => {
      window.removeEventListener("mousedown", close)
      window.removeEventListener("keydown", close)
    }
  }, [menuOpen])

  const isActive = (to: string) => {
    if (to === "/arenas") {
      return (
        location.pathname === "/arenas" ||
        (location.pathname.startsWith("/arenas/") && location.pathname !== "/arenas/solicitar")
      )
    }
    return location.pathname === to
  }

  // Visibilidade de links apenas por conveniência: a autorização real é do backend.
  const showManager = auth.hasRole("manager") || env.previewWithoutAuth
  const showAdmin = auth.hasRole("admin") || env.previewWithoutAuth
  const signedIn = auth.status === "authenticated"
  const initial = (auth.account?.name || auth.user?.name || auth.user?.email || "?").charAt(0).toUpperCase()

  // O redirecionamento após o logout fica no AuthContext.
  const signOut = async () => {
    setSignOutError(null)
    const result = await auth.signOut()
    if (!result.ok) setSignOutError(result.message)
  }

  const signOutButton = (
    <>
      <button type="button" onClick={signOut} disabled={auth.signingOut} aria-busy={auth.signingOut}>
        {auth.signingOut ? "Saindo…" : "Sair"}
      </button>
      {signOutError && (
        <p className="field-error" role="alert">
          {signOutError}
        </p>
      )}
    </>
  )

  const accountLinks = (
    <>
      <Link to="/perfil">Meu perfil</Link>
      <Link to="/minhas-reservas">Minhas reservas</Link>
      <Link to="/minhas-solicitacoes">Minhas solicitações</Link>
      {showManager && <Link to="/gestor">Painel do gestor</Link>}
      {showAdmin && <Link to="/admin">Administração</Link>}
      {/* Sem /api/me não há papéis: avisa em vez de esconder o painel do gestor/admin em silêncio. */}
      {auth.accountStatus === "error" && (
        <div className="menu-notice" role="status">
          <span>Não foi possível carregar suas permissões. {auth.accountError}</span>
          <button type="button" onClick={auth.reloadAccount}>
            Tentar novamente
          </button>
        </div>
      )}
    </>
  )

  return (
    <div className="public-shell">
      <DemoBanner />
      <PreviewBanner />
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="public-brand" aria-label="ArenaHub — página inicial">
            <img src={arenaLogo} alt="ArenaHub" />
          </Link>
          <nav className="public-nav" aria-label="Navegação principal">
            {links.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={isActive(item.to) ? "is-active" : ""}
                aria-current={isActive(item.to) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="public-actions">
            {signedIn ? (
              <div className="user-menu" ref={menuRef}>
                <button
                  type="button"
                  className="user-menu-trigger"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <span className="avatar">{initial}</span>
                  <span className="user-menu-name">
                    {auth.account?.name || auth.user?.email}
                  </span>
                </button>
                {menuOpen && (
                  <div className="user-menu-panel" role="menu">
                    {accountLinks}
                    {signOutButton}
                  </div>
                )}
              </div>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate("/entrar")}>
                  Entrar
                </Button>
                <Button onClick={() => navigate("/cadastro")}>Criar conta</Button>
              </>
            )}
          </div>
          <Button
            variant="icon"
            className="public-menu-toggle"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <Icon name={mobileOpen ? "close" : "menu"} />
          </Button>
        </div>
        {mobileOpen && (
          <div className="public-mobile-panel">
            {links.map((item) => (
              <Link key={item.to} to={item.to} className={isActive(item.to) ? "is-active" : ""}>
                {item.label}
              </Link>
            ))}
            <hr />
            {signedIn ? (
              <>
                {accountLinks}
                {signOutButton}
              </>
            ) : (
              <div className="public-mobile-auth">
                <Button variant="secondary" onClick={() => navigate("/entrar")}>
                  Entrar
                </Button>
                <Button onClick={() => navigate("/cadastro")}>Criar conta</Button>
              </div>
            )}
          </div>
        )}
      </header>
      <main className="public-main">
        <Outlet />
      </main>
      <footer className="public-footer">
        <span>© ArenaHub · Descubra, reserve e gerencie arenas esportivas</span>
        <Link to="/arenas/solicitar">Tem uma arena? Solicite o cadastro</Link>
      </footer>
    </div>
  )
}

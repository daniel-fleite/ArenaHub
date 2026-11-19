import type { ReactNode } from "react"
import { Link, Outlet } from "react-router-dom"
import { DemoBanner, PreviewBanner } from "@/components/common"
import arenaLogo from "../../assets/arenaLogo-sidebar.png"

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <DemoBanner />
      <PreviewBanner />
      <div className="auth-box">
        <Link to="/" className="auth-logo">
          <img src={arenaLogo} alt="ArenaHub" />
        </Link>
        <section className="auth-card">{children}</section>
        <p className="auth-back">
          <Link to="/">← Voltar ao site</Link>
        </p>
      </div>
    </div>
  )
}

export default function AuthLayout() {
  return (
    <AuthFrame>
      <Outlet />
    </AuthFrame>
  )
}

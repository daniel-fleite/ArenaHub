import { useEffect } from "react"
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { EmptyState } from "@/components/ui"
import AdminLayout from "@/layouts/AdminLayout"
import AuthLayout from "@/layouts/AuthLayout"
import ManagerLayout from "@/layouts/ManagerLayout"
import PublicLayout from "@/layouts/PublicLayout"
// Painel do gestor: páginas originais, sem alterações.
import Campeonatos from "@/pages/Campeonatos"
import Dashboard from "@/pages/Dashboard"
import Quadras from "@/pages/Quadras"
import Reservas from "@/pages/Reservas"
import Social from "@/pages/Social"
import Vendas from "@/pages/Vendas"
import Cadastro from "@/pages/auth/Cadastro"
import Login from "@/pages/auth/Login"
import RecuperarSenha from "@/pages/auth/RecuperarSenha"
import RedefinirSenha from "@/pages/auth/RedefinirSenha"
import Home from "@/pages/public/Home"
import Arenas from "@/pages/public/Arenas"
import ArenaDetalhe from "@/pages/public/ArenaDetalhe"
import MinhasReservas from "@/pages/account/MinhasReservas"
import MinhasSolicitacoes from "@/pages/account/MinhasSolicitacoes"
import Perfil from "@/pages/account/Perfil"
import Reservar from "@/pages/account/Reservar"
import SolicitarArena from "@/pages/account/SolicitarArena"
import AdminArenas from "@/pages/admin/AdminArenas"
import AdminDashboard from "@/pages/admin/AdminDashboard"
import AdminIndicadores from "@/pages/admin/AdminIndicadores"
import AdminSolicitacaoDetalhe from "@/pages/admin/AdminSolicitacaoDetalhe"
import AdminSolicitacoes from "@/pages/admin/AdminSolicitacoes"
import AdminUsuarios from "@/pages/admin/AdminUsuarios"
import { RequireAuth, RequireRole } from "./guards"

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function NotFound() {
  return (
    <div className="page">
      <EmptyState
        icon="search"
        title="Página não encontrada"
        description="O endereço acessado não existe ou foi movido."
        action={
          <Link className="button button-primary" to="/">
            Ir para o início
          </Link>
        }
      />
    </div>
  )
}

export default function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Autenticação */}
        <Route element={<AuthLayout />}>
          <Route path="/entrar" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/recuperar-senha" element={<RecuperarSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
        </Route>

        {/* Área pública e da conta (atleta) */}
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="/arenas" element={<Arenas />} />
          <Route path="/arenas/:id" element={<ArenaDetalhe />} />
          <Route element={<RequireAuth />}>
            <Route path="/arenas/solicitar" element={<SolicitarArena />} />
            <Route path="/reservar/:arenaId" element={<Reservar />} />
            <Route path="/minhas-reservas" element={<MinhasReservas />} />
            <Route path="/minhas-solicitacoes" element={<MinhasSolicitacoes />} />
            <Route path="/perfil" element={<Perfil />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route element={<RequireAuth />}>
          {/* Painel do gestor de arena (páginas originais) */}
          <Route element={<RequireRole role="manager" />}>
            <Route path="/gestor" element={<ManagerLayout />}>
              <Route index element={<Navigate to="/gestor/quadras" replace />} />
              <Route path="quadras" element={<Quadras />} />
              <Route path="reservas" element={<Reservas />} />
              <Route path="campeonatos" element={<Campeonatos />} />
              <Route path="vendas" element={<Vendas />} />
              <Route path="social" element={<Social />} />
              <Route path="indicadores" element={<Dashboard />} />
            </Route>
          </Route>

          {/* Administração da plataforma */}
          <Route element={<RequireRole role="admin" />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="solicitacoes" element={<AdminSolicitacoes />} />
              <Route path="solicitacoes/:id" element={<AdminSolicitacaoDetalhe />} />
              <Route path="arenas" element={<AdminArenas />} />
              <Route path="usuarios" element={<AdminUsuarios />} />
              <Route path="indicadores" element={<AdminIndicadores />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </>
  )
}

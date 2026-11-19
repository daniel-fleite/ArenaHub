import { BrowserRouter } from "react-router-dom"
import { AuthContextProvider } from "@/contexts/AuthContext"
import AppRoutes from "@/routes/AppRoutes"

// O Vite pode servir a aplicação em um subcaminho (base). O basename precisa ser só o
// caminho, mesmo quando BASE_URL vier como URL completa.
function getBasename() {
  const base = import.meta.env.BASE_URL || "/"
  try {
    const path = /^https?:\/\//.test(base) ? new URL(base).pathname : base
    const trimmed = path.replace(/\/+$/, "")
    return trimmed || undefined
  } catch {
    return undefined
  }
}

/**
 * Raiz da aplicação. O painel do gestor (antes controlado por useState) agora vive em /gestor/*;
 * ver src/routes/AppRoutes.tsx e src/layouts/ManagerLayout.tsx.
 */
export default function App() {
  return (
    <BrowserRouter basename={getBasename()}>
      <AuthContextProvider>
        <AppRoutes />
      </AuthContextProvider>
    </BrowserRouter>
  )
}

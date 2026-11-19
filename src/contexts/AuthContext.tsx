import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { authProvider } from "@/services/auth"
import type { AuthProvider, AuthResult } from "@/services/auth/types"
import { getAccount } from "@/services/account"
import { describeError, setAccessTokenGetter } from "@/services/http"
import type { Account, AuthSession, AuthUser, Role } from "@/types"

type AuthStatus = "loading" | "authenticated" | "unauthenticated"
type AccountStatus = "idle" | "loading" | "ready" | "error"

interface AuthContextValue {
  provider: AuthProvider
  configured: boolean
  status: AuthStatus
  session: AuthSession | null
  user: AuthUser | null
  /** Conta e papéis vindos do servidor (GET /api/me). Nulo enquanto não carregados. */
  account: Account | null
  accountStatus: AccountStatus
  accountError: string | null
  signIn: AuthProvider["signIn"]
  signUp: AuthProvider["signUp"]
  /** Encerra a sessão no provedor e, se der certo, leva o usuário para "/". */
  signOut: () => Promise<AuthResult>
  /** true enquanto o logout está em andamento (para desabilitar os botões "Sair"). */
  signingOut: boolean
  /**
   * true do pedido de logout até a navegação para "/" terminar. Faz os guards mandarem para "/"
   * em vez de "/entrar", evitando que o redirecionamento do guard dispute com o do logout.
   */
  signedOutByUser: boolean
  requestPasswordReset: AuthProvider["requestPasswordReset"]
  updatePassword: AuthProvider["updatePassword"]
  reloadAccount: () => void
  /**
   * Apenas para decidir o que exibir. NÃO é controle de acesso: a autorização real
   * precisa ser verificada pelo backend em cada requisição.
   */
  hasRole: (role: Role) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthContextProvider({ children }: { children: ReactNode }) {
  const provider = authProvider
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [session, setSession] = useState<AuthSession | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [account, setAccount] = useState<Account | null>(null)
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("idle")
  const [accountError, setAccountError] = useState<string | null>(null)
  const [accountNonce, setAccountNonce] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const [signedOutByUser, setSignedOutByUser] = useState(false)
  const sessionRef = useRef<AuthSession | null>(null)
  const signOutRef = useRef<Promise<AuthResult> | null>(null)

  const applySession = useCallback((next: AuthSession | null) => {
    sessionRef.current = next
    setSession(next)
    setStatus(next ? "authenticated" : "unauthenticated")
    if (next && !signOutRef.current) setSignedOutByUser(false)
  }, [])

  useEffect(() => {
    setAccessTokenGetter(() => sessionRef.current?.accessToken ?? null)
    let active = true
    provider
      .getSession()
      .then((current) => active && applySession(current))
      .catch(() => active && applySession(null))
    const unsubscribe = provider.onAuthStateChange((next) => active && applySession(next))
    return () => {
      active = false
      unsubscribe()
    }
  }, [provider, applySession])

  useEffect(() => {
    if (!session) {
      setAccount(null)
      setAccountStatus("idle")
      setAccountError(null)
      return
    }
    const controller = new AbortController()
    setAccountStatus("loading")
    getAccount(controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return
        setAccount(loaded)
        setAccountStatus("ready")
        setAccountError(null)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setAccount(null)
        setAccountStatus("error")
        setAccountError(describeError(error))
      })
    return () => controller.abort()
  }, [session, accountNonce])

  const signOut = useCallback(() => {
    // Cliques repetidos reutilizam o logout em andamento em vez de disparar outro.
    if (signOutRef.current) return signOutRef.current
    const run = async (): Promise<AuthResult> => {
      setSigningOut(true)
      setSignedOutByUser(true)
      try {
        let result = await provider.signOut()
        if (!result.ok && provider.configured) {
          // O Supabase descarta a sessão local mesmo quando a revogação no servidor falha
          // (ex.: erro 5xx). Se não restou sessão, o usuário já está deslogado neste navegador.
          const remaining = await provider.getSession().catch(() => sessionRef.current)
          if (!remaining) result = { ok: true, data: undefined }
        }
        if (result.ok) {
          applySession(null)
          navigate("/", { replace: true })
        } else {
          setSignedOutByUser(false)
        }
        return result
      } catch {
        setSignedOutByUser(false)
        return { ok: false, code: "unknown", message: "Não foi possível sair da conta. Tente novamente." }
      } finally {
        signOutRef.current = null
        setSigningOut(false)
      }
    }
    signOutRef.current = run()
    return signOutRef.current
  }, [provider, applySession, navigate])

  // O router aplica a navegação em uma transição; só depois de chegar a "/" os guards voltam
  // a mandar visitantes para "/entrar".
  useEffect(() => {
    if (signedOutByUser && !signingOut && pathname === "/") setSignedOutByUser(false)
  }, [signedOutByUser, signingOut, pathname])

  const value = useMemo<AuthContextValue>(
    () => ({
      provider,
      configured: provider.configured,
      status,
      session,
      user: session?.user ?? null,
      account,
      accountStatus,
      accountError,
      signIn: async (email, password) => {
        const result = await provider.signIn(email, password)
        if (result.ok) applySession(result.data)
        return result
      },
      signUp: (input) => provider.signUp(input),
      signOut,
      signingOut,
      signedOutByUser,
      requestPasswordReset: (email) => provider.requestPasswordReset(email),
      updatePassword: (password) => provider.updatePassword(password),
      reloadAccount: () => setAccountNonce((n) => n + 1),
      hasRole: (role) =>
        role === "athlete" ? Boolean(session) : Boolean(account?.roles.includes(role)),
    }),
    [
      provider,
      status,
      session,
      account,
      accountStatus,
      accountError,
      signOut,
      signingOut,
      signedOutByUser,
      applySession,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthContextProvider.")
  return context
}

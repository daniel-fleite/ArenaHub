import type { AuthSession } from "@/types"

export type AuthErrorCode = "not_configured" | "invalid_credentials" | "unknown"
export type AuthResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: AuthErrorCode; message: string }

/**
 * Contrato único de autenticação. As páginas só conhecem esta interface (via AuthContext).
 * Para integrar o Supabase Auth, implemente-a em um novo adaptador e troque o provedor em
 * services/auth/index.ts: nenhuma página precisa mudar.
 */
export interface AuthProvider {
  readonly id: string
  /** false = nenhum provedor real conectado. A interface deve avisar o usuário. */
  readonly configured: boolean
  getSession(): Promise<AuthSession | null>
  signIn(email: string, password: string): Promise<AuthResult<AuthSession>>
  signUp(input: {
    name: string
    email: string
    password: string
  }): Promise<AuthResult<{ needsEmailConfirmation: boolean }>>
  signOut(): Promise<AuthResult>
  requestPasswordReset(email: string): Promise<AuthResult>
  /** Usada após o usuário abrir o link de recuperação (sessão de recuperação do provedor). */
  updatePassword(newPassword: string): Promise<AuthResult>
  onAuthStateChange(listener: (session: AuthSession | null) => void): () => void
}

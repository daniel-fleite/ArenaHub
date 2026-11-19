import type { AuthProvider, AuthResult } from "./types"

const message =
  "A autenticação ainda não está configurada neste ambiente. Esta ação depende da integração com o Supabase Auth."

const fail = <T = void>(): AuthResult<T> => ({ ok: false, code: "not_configured", message })

/**
 * Provedor padrão: NÃO autentica ninguém e nunca cria sessão.
 * Toda operação devolve "not_configured" para que a interface seja honesta.
 */
export const unconfiguredProvider: AuthProvider = {
  id: "unconfigured",
  configured: false,
  async getSession() {
    return null
  },
  async signIn() {
    return fail()
  },
  async signUp() {
    return fail()
  },
  async signOut() {
    return fail()
  },
  async requestPasswordReset() {
    return fail()
  },
  async updatePassword() {
    return fail()
  },
  onAuthStateChange() {
    return () => {}
  },
}

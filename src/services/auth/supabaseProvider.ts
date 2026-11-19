import { createClient, type Session } from "@supabase/supabase-js"
import type { AuthSession } from "@/types"
import type { AuthProvider, AuthResult } from "./types"

function toSession(session: Session | null): AuthSession | null {
  if (!session?.user.email) return null
  return {
    accessToken: session.access_token,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: typeof session.user.user_metadata?.name === "string"
        ? session.user.user_metadata.name
        : undefined,
    },
  }
}

function failed(error: { message: string; status?: number }): AuthResult<never> {
  return {
    ok: false,
    code: error.status === 400 || error.status === 401 ? "invalid_credentials" : "unknown",
    message: error.message,
  }
}

export function createSupabaseProvider(url: string, anonKey: string): AuthProvider {
  const client = createClient(url, anonKey)
  return {
    id: "supabase",
    configured: true,
    async getSession() {
      const { data, error } = await client.auth.getSession()
      if (error) throw error
      return toSession(data.session)
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error) return failed(error)
      const session = toSession(data.session)
      return session ? { ok: true, data: session } : {
        ok: false, code: "unknown", message: "Não foi possível iniciar a sessão.",
      }
    },
    async signUp({ name, email, password }) {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/entrar`,
        },
      })
      if (error) return failed(error)
      return { ok: true, data: { needsEmailConfirmation: !data.session } }
    },
    async signOut() {
      const { error } = await client.auth.signOut()
      return error ? failed(error) : { ok: true, data: undefined }
    },
    async requestPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      })
      return error ? failed(error) : { ok: true, data: undefined }
    },
    async updatePassword(newPassword) {
      const { error } = await client.auth.updateUser({ password: newPassword })
      return error ? failed(error) : { ok: true, data: undefined }
    },
    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toSession(session)))
      return () => data.subscription.unsubscribe()
    },
  }
}

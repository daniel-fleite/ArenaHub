import type { AuthProvider } from "./types"
import { unconfiguredProvider } from "./unconfiguredProvider"
import { createSupabaseProvider } from "./supabaseProvider"
import { env } from "@/config/env"

export type { AuthProvider, AuthResult } from "./types"

/**
 * Ponto único de escolha do provedor de autenticação.
 *
 * Integração futura com o Supabase Auth (ainda NÃO implementada):
 *   1. adicionar @supabase/supabase-js e as variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY;
 *   2. criar services/auth/supabaseProvider.ts implementando `AuthProvider`
 *      (signInWithPassword, signUp, signOut, resetPasswordForEmail, updateUser, onAuthStateChange);
 *   3. exportar aqui o provedor Supabase quando as variáveis existirem.
 * O token de acesso do provedor é enviado como Bearer pelo cliente HTTP (services/http.ts),
 * e a API Express deve validá-lo no servidor.
 */
export const authProvider: AuthProvider = env.supabaseUrl && env.supabasePublishableKey
  ? createSupabaseProvider(env.supabaseUrl, env.supabasePublishableKey)
  : unconfiguredProvider

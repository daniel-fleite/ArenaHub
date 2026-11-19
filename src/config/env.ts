// Variáveis de ambiente do frontend (apenas VITE_*). Nunca coloque segredos aqui:
// tudo que começa com VITE_ é embutido no bundle e visível no navegador.
const raw = import.meta.env

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * Em desenvolvimento, a API costuma estar em http://localhost:3000. Se o app for aberto por outro
 * host da mesma máquina (ex.: o endereço de rede que o Vite mostra, http://192.168.1.23:8443),
 * o navegador bloqueia chamadas da página para "localhost". Nesse caso usamos o mesmo host da
 * página, mantendo porta e caminho configurados. URLs de API não locais ficam como estão.
 */
function resolveApiUrl(configured: string) {
  if (!configured || typeof window === "undefined") return configured
  try {
    const url = new URL(configured)
    const pageHost = window.location.hostname
    if (LOOPBACK.has(url.hostname) && !LOOPBACK.has(pageHost)) {
      url.hostname = pageHost
      return url.toString().replace(/\/+$/, "")
    }
  } catch {
    // URL relativa ou inválida: mantém como configurada.
  }
  return configured
}

export const env = {
  /** URL base da API Express (ex.: http://localhost:3000). Vazia = API não configurada. */
  apiUrl: resolveApiUrl(String(raw.VITE_API_URL ?? "").trim().replace(/\/+$/, "")),
  /** Liga os dados de demonstração isolados em src/demo. Somente leitura, nunca persiste nada. */
  demoEnabled: raw.VITE_ENABLE_DEMO_DATA === "true",
  /**
   * Pré-visualização de interface SEM autenticação: libera as telas protegidas para revisão visual.
   * Não cria sessão nem concede permissão real. Não use fora de revisão de interface.
   */
  previewWithoutAuth: raw.VITE_PREVIEW_WITHOUT_AUTH === "true",
  supabaseUrl: String(raw.VITE_SUPABASE_URL ?? "").trim(),
  supabasePublishableKey: String(
    raw.VITE_SUPABASE_PUBLISHABLE_KEY ?? raw.VITE_SUPABASE_ANON_KEY ?? "",
  ).trim(),
} as const

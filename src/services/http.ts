import { env } from "@/config/env"

/** Cliente HTTP para a API Express. Nunca fala com o banco: só com VITE_API_URL. */

export class ApiNotConfiguredError extends Error {
  constructor() {
    super("API não configurada (VITE_API_URL ausente).")
  }
}
export class ApiUnavailableError extends Error {
  constructor() {
    super("Não foi possível conectar ao servidor.")
  }
}
export class ApiError extends Error {
  status: number
  /** true quando a mensagem veio do corpo JSON da resposta do servidor. */
  fromServer: boolean
  constructor(message: string, status: number, fromServer = false) {
    super(message)
    this.status = status
    this.fromServer = fromServer
  }
}
/** Escritas são bloqueadas no modo demonstração para nunca simular persistência. */
export class DemoModeWriteError extends Error {
  constructor() {
    super(
      "Modo demonstração ativo: esta ação não foi enviada ao servidor e nada foi salvo.",
    )
  }
}

let tokenGetter: () => string | null = () => null
/** Registrado pelo AuthContext; devolve o token do provedor de autenticação real (se houver). */
export function setAccessTokenGetter(getter: () => string | null) {
  tokenGetter = getter
}

type Query = Record<string, string | number | undefined | null>
export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  formData?: FormData
  query?: Query
  signal?: AbortSignal
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!env.apiUrl) throw new ApiNotConfiguredError()

  const url = new URL(env.apiUrl + path, window.location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value))
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" }
  const token = tokenGetter()
  if (token) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (options.formData) {
    body = options.formData
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body,
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiUnavailableError()
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!response.ok) {
    const serverMessage =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : ""
    throw new ApiError(serverMessage || `Erro ${response.status}`, response.status, Boolean(serverMessage))
  }
  return data as T
}

/** Converte qualquer falha em uma mensagem clara e honesta para a interface. */
export function describeError(error: unknown): string {
  if (error instanceof DemoModeWriteError) return error.message
  if (error instanceof ApiNotConfiguredError) {
    return "A API não está configurada neste ambiente. Defina VITE_API_URL para conectar ao backend Express."
  }
  if (error instanceof ApiUnavailableError) {
    return "Não foi possível conectar ao servidor. Verifique se o backend está em execução e tente novamente."
  }
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sessão ausente ou expirada. Entre novamente para continuar."
    // 403 com mensagem do servidor (ex.: conta suspensa) é exibido como veio; senão, genérico.
    if (error.status === 403) return error.fromServer ? error.message : "Você não tem permissão para realizar esta ação."
    if ((error.status === 404 || error.status === 405) && !error.fromServer) {
      return "Esta funcionalidade depende de um endpoint que ainda não existe no backend."
    }
    return error.message
  }
  return "Ocorreu um erro inesperado. Tente novamente."
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

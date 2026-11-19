import { env } from "@/config/env"
import type { ArenaRequest, ArenaRequestInput, Sourced } from "@/types"
import { ApiError, apiRequest, DemoModeWriteError } from "./http"

/** GET /api/me/arena-requests: somente as solicitações da conta autenticada. */
export async function listMyArenaRequests(signal?: AbortSignal): Promise<Sourced<ArenaRequest[]>> {
  if (env.demoEnabled) {
    const { demoMyRequests } = await import("@/demo")
    return { data: demoMyRequests, source: "demo" }
  }
  const res = await apiRequest<{ requests: ArenaRequest[] }>("/api/me/arena-requests", { signal })
  return { data: res.requests ?? [], source: "api" }
}

export interface CreateArenaRequestResult {
  request: ArenaRequest
  /** null = sem imagens a enviar; false = a solicitação foi salva, mas o envio das imagens falhou. */
  imagesUploaded: boolean | null
  imageError?: unknown
}

/**
 * POST /api/arena-requests. A solicitação nasce sempre com status "pendente" no servidor.
 * O envio de imagens ainda não existe no backend: a solicitação é registrada sem elas e a
 * interface avisa, em vez de chamar um endpoint inexistente.
 */
export async function createArenaRequest(
  input: ArenaRequestInput,
  images: File[],
): Promise<CreateArenaRequestResult> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  const res = await apiRequest<{ request: ArenaRequest }>("/api/arena-requests", {
    method: "POST",
    body: input,
  })
  if (images.length === 0) return { request: res.request, imagesUploaded: null }
  return {
    request: res.request,
    imagesUploaded: false,
    imageError: new ApiError("o envio de imagens ainda não está disponível no servidor.", 501, true),
  }
}

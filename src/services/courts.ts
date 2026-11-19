import { env } from "@/config/env"
import type { CourtPayload, ManagedArena, ManagedCourt } from "@/types"
import { apiRequest, DemoModeWriteError } from "./http"

// Sem dados de demonstração: o painel do gestor só mostra o que o servidor devolve.

/** GET /api/manager/arenas: arenas vinculadas ao token (admin: todas), com todas as quadras. */
export async function listManagedArenas(signal?: AbortSignal): Promise<ManagedArena[]> {
  const res = await apiRequest<{ arenas: ManagedArena[] }>("/api/manager/arenas", { signal })
  return res.arenas ?? []
}

const courtsPath = (arenaId: string) => `/api/arenas/${encodeURIComponent(arenaId)}/courts`

export async function createCourt(arenaId: string, payload: CourtPayload): Promise<ManagedCourt> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  const res = await apiRequest<{ court: ManagedCourt }>(courtsPath(arenaId), { method: "POST", body: payload })
  return res.court
}

export async function updateCourt(arenaId: string, courtId: string, payload: CourtPayload): Promise<ManagedCourt> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  const res = await apiRequest<{ court: ManagedCourt }>(
    `${courtsPath(arenaId)}/${encodeURIComponent(courtId)}`,
    { method: "PUT", body: payload },
  )
  return res.court
}

export async function deleteCourt(arenaId: string, courtId: string): Promise<void> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  await apiRequest(`${courtsPath(arenaId)}/${encodeURIComponent(courtId)}`, { method: "DELETE" })
}

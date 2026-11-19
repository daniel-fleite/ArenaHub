import { env } from "@/config/env"
import type {
  ArenaRequest,
  ArenaRequestStatus,
  PlatformArena,
  PlatformStats,
  PlatformUser,
  Sourced,
} from "@/types"
import { ApiError, apiRequest, DemoModeWriteError } from "./http"

// Endpoints da área administrativa (/api/admin/*). A autorização (papel admin) é aplicada no
// servidor em cada rota; o frontend só esconde telas.

export async function getPlatformStats(signal?: AbortSignal): Promise<Sourced<PlatformStats>> {
  if (env.demoEnabled) {
    const { demoStats } = await import("@/demo")
    return { data: demoStats, source: "demo" }
  }
  const res = await apiRequest<{ stats: PlatformStats }>("/api/admin/stats", { signal })
  return { data: res.stats, source: "api" }
}

export async function listPlatformArenas(signal?: AbortSignal): Promise<Sourced<PlatformArena[]>> {
  if (env.demoEnabled) {
    const { demoPlatformArenas } = await import("@/demo")
    return { data: demoPlatformArenas, source: "demo" }
  }
  const res = await apiRequest<{ arenas: PlatformArena[] }>("/api/admin/arenas", { signal })
  return { data: res.arenas ?? [], source: "api" }
}

export async function listArenaRequests(
  status?: ArenaRequestStatus,
  signal?: AbortSignal,
): Promise<Sourced<ArenaRequest[]>> {
  if (env.demoEnabled) {
    const { demoRequests } = await import("@/demo")
    return { data: status ? demoRequests.filter((r) => r.status === status) : demoRequests, source: "demo" }
  }
  const res = await apiRequest<{ requests: ArenaRequest[] }>("/api/admin/arena-requests", {
    query: { status },
    signal,
  })
  return { data: res.requests ?? [], source: "api" }
}

export async function getArenaRequest(id: string, signal?: AbortSignal): Promise<Sourced<ArenaRequest>> {
  if (env.demoEnabled) {
    const { demoRequests } = await import("@/demo")
    const found = demoRequests.find((item) => item.id === id)
    if (!found) throw new ApiError("Solicitação de demonstração não encontrada.", 404, true)
    return { data: found, source: "demo" }
  }
  const res = await apiRequest<{ request: ArenaRequest }>(
    `/api/admin/arena-requests/${encodeURIComponent(id)}`,
    { signal },
  )
  return { data: res.request, source: "api" }
}

/** Devolve a solicitação como o SERVIDOR a gravou; a interface só muda de estado com esta resposta. */
export async function approveArenaRequest(id: string): Promise<ArenaRequest> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  const res = await apiRequest<{ request: ArenaRequest }>(
    `/api/admin/arena-requests/${encodeURIComponent(id)}/approve`,
    { method: "POST" },
  )
  return res.request
}

export async function rejectArenaRequest(id: string, reason: string): Promise<ArenaRequest> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  const res = await apiRequest<{ request: ArenaRequest }>(
    `/api/admin/arena-requests/${encodeURIComponent(id)}/reject`,
    { method: "POST", body: { reason } },
  )
  return res.request
}

export async function listPlatformUsers(signal?: AbortSignal): Promise<Sourced<PlatformUser[]>> {
  if (env.demoEnabled) {
    const { demoUsers } = await import("@/demo")
    return { data: demoUsers, source: "demo" }
  }
  const res = await apiRequest<{ users: PlatformUser[] }>("/api/admin/users", { signal })
  return { data: res.users ?? [], source: "api" }
}

export async function setUserStatus(id: string, status: PlatformUser["status"]): Promise<PlatformUser> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  const res = await apiRequest<{ user: PlatformUser }>(`/api/admin/users/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: { status },
  })
  return res.user
}

export async function revokeArenaAccess(userId: string, arenaId: string): Promise<PlatformUser> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  const res = await apiRequest<{ user: PlatformUser }>(
    `/api/admin/users/${encodeURIComponent(userId)}/arenas/${encodeURIComponent(arenaId)}`,
    { method: "DELETE" },
  )
  return res.user
}

/** PATCH /api/admin/arenas/:id: situação e/ou foto (https). Devolve a arena como o servidor gravou. */
export async function updatePlatformArena(
  id: string,
  update: { status?: PlatformArena["status"]; imageUrl?: string | null },
): Promise<PlatformArena> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  const res = await apiRequest<{ arena: PlatformArena }>(`/api/admin/arenas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: update,
  })
  return res.arena
}

/** POST /api/admin/users/:id/arenas: vincula o usuário como gestor da arena. */
export async function grantArenaAccess(userId: string, arenaId: string): Promise<PlatformUser> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  const res = await apiRequest<{ user: PlatformUser }>(`/api/admin/users/${encodeURIComponent(userId)}/arenas`, {
    method: "POST",
    body: { arenaId },
  })
  return res.user
}

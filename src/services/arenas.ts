import { sportOptions, type SportId } from "@/data/courts"
import { env } from "@/config/env"
import type { CatalogArena, CourtAvailability, Sourced } from "@/types"
import { ApiError, apiRequest } from "./http"

const validSports = new Set<string>(sportOptions.map((option) => option.id))
const parseSports = (value: unknown): SportId[] =>
  Array.isArray(value) ? (value.filter((v) => validSports.has(String(v))) as SportId[]) : []

interface ApiArenaRow {
  id: number | string
  name: string
  city?: string | null
  state?: string | null
  address?: string | null
  description?: string | null
  image_url?: string | null
  sports?: unknown
  courts?: unknown
}

/** Converte a linha do servidor sem inventar campos: o que não vier fica vazio. */
function mapArena(row: ApiArenaRow): CatalogArena {
  const courts = Array.isArray(row.courts)
    ? (row.courts as Record<string, unknown>[]).map((court) => ({
        id: String(court.id),
        name: String(court.name ?? "Quadra"),
        sports: parseSports(court.sports),
        hourlyRate: typeof court.hourly_rate === "number" ? court.hourly_rate : undefined,
        capacity: typeof court.capacity === "number" ? court.capacity : undefined,
      }))
    : []
  const rates = courts.map((c) => c.hourlyRate).filter((v): v is number => typeof v === "number")
  const courtSports = courts.flatMap((c) => c.sports)
  return {
    id: String(row.id),
    name: row.name,
    city: row.city ?? "",
    state: row.state ?? "",
    address: row.address ?? undefined,
    description: row.description ?? undefined,
    imageUrl: row.image_url ?? undefined,
    sports: [...new Set([...parseSports(row.sports), ...courtSports])],
    priceFrom: rates.length ? Math.min(...rates) : undefined,
    courts,
  }
}

/** GET /api/arenas (já existe; hoje devolve só id, name, city e state). */
export async function listArenas(signal?: AbortSignal): Promise<Sourced<CatalogArena[]>> {
  if (env.demoEnabled) {
    const { demoArenas } = await import("@/demo")
    return { data: demoArenas, source: "demo" }
  }
  const res = await apiRequest<{ arenas: ApiArenaRow[] }>("/api/arenas", { signal })
  return { data: (res.arenas ?? []).map(mapArena), source: "api" }
}

/** GET /api/arenas/:id (já existe; quadras e preços dependem de evolução do backend). */
export async function getArena(id: string, signal?: AbortSignal): Promise<Sourced<CatalogArena>> {
  if (env.demoEnabled) {
    const { demoArenas } = await import("@/demo")
    const arena = demoArenas.find((item) => item.id === id)
    if (!arena) throw new ApiError("Arena de demonstração não encontrada.", 404, true)
    return { data: arena, source: "demo" }
  }
  const res = await apiRequest<{ arena: ApiArenaRow }>(`/api/arenas/${encodeURIComponent(id)}`, { signal })
  return { data: mapArena(res.arena), source: "api" }
}

/** GET /api/arenas/:id/availability?date=YYYY-MM-DD (a implementar). */
export async function getAvailability(
  arenaId: string,
  date: string,
  signal?: AbortSignal,
): Promise<Sourced<CourtAvailability[]>> {
  if (env.demoEnabled) {
    const { demoAvailability } = await import("@/demo")
    return { data: demoAvailability(arenaId, date), source: "demo" }
  }
  const res = await apiRequest<{ courts: CourtAvailability[] }>(
    `/api/arenas/${encodeURIComponent(arenaId)}/availability`,
    { query: { date }, signal },
  )
  return { data: res.courts ?? [], source: "api" }
}

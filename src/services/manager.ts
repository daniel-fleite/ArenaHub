import { env } from "@/config/env"
import type {
  ArenaPost,
  Championship,
  ChampionshipInput,
  ManagerDashboard,
  ManagerReservation,
  PostKind,
  Product,
  ProductInput,
  Sale,
} from "@/types"
import { apiRequest, DemoModeWriteError } from "./http"

// Painel do gestor. A autorização (gestor vinculado ou admin) é feita pelo servidor em cada rota.

const base = (arenaId: string) => `/api/manager/arenas/${encodeURIComponent(arenaId)}`
const guardWrite = () => {
  if (env.demoEnabled) throw new DemoModeWriteError()
}

export async function getDashboard(arenaId: string, days: number, signal?: AbortSignal) {
  const res = await apiRequest<{ dashboard: ManagerDashboard }>(`${base(arenaId)}/dashboard`, { query: { days }, signal })
  return res.dashboard
}

// Reservas
export async function listArenaReservations(
  arenaId: string,
  filters: { date?: string; status?: string },
  signal?: AbortSignal,
) {
  const res = await apiRequest<{ reservations: ManagerReservation[] }>(`${base(arenaId)}/reservations`, {
    query: filters,
    signal,
  })
  return res.reservations ?? []
}

export async function cancelArenaReservation(arenaId: string, reservationId: string, reason: string | null) {
  guardWrite()
  const res = await apiRequest<{ reservation: ManagerReservation }>(
    `${base(arenaId)}/reservations/${encodeURIComponent(reservationId)}/cancel`,
    { method: "POST", body: { reason } },
  )
  return res.reservation
}

// Produtos e vendas
export async function listProducts(arenaId: string, signal?: AbortSignal) {
  return (await apiRequest<{ products: Product[] }>(`${base(arenaId)}/products`, { signal })).products ?? []
}
export async function saveProduct(arenaId: string, input: ProductInput, productId?: string) {
  guardWrite()
  const path = productId ? `${base(arenaId)}/products/${encodeURIComponent(productId)}` : `${base(arenaId)}/products`
  return (await apiRequest<{ product: Product }>(path, { method: productId ? "PUT" : "POST", body: input })).product
}
export async function deleteProduct(arenaId: string, productId: string) {
  guardWrite()
  await apiRequest(`${base(arenaId)}/products/${encodeURIComponent(productId)}`, { method: "DELETE" })
}
export async function listSales(arenaId: string, signal?: AbortSignal) {
  return (await apiRequest<{ sales: Sale[] }>(`${base(arenaId)}/sales`, { signal })).sales ?? []
}
export async function createSale(arenaId: string, input: { productId: string; quantity: number }) {
  guardWrite()
  return (await apiRequest<{ sale: Sale }>(`${base(arenaId)}/sales`, { method: "POST", body: input })).sale
}
export async function deleteSale(arenaId: string, saleId: string) {
  guardWrite()
  await apiRequest(`${base(arenaId)}/sales/${encodeURIComponent(saleId)}`, { method: "DELETE" })
}

// Campeonatos
export async function listChampionships(arenaId: string, signal?: AbortSignal) {
  return (await apiRequest<{ championships: Championship[] }>(`${base(arenaId)}/championships`, { signal })).championships ?? []
}
export async function saveChampionship(arenaId: string, input: ChampionshipInput, championshipId?: string) {
  guardWrite()
  const path = championshipId
    ? `${base(arenaId)}/championships/${encodeURIComponent(championshipId)}`
    : `${base(arenaId)}/championships`
  return (await apiRequest<{ championship: Championship }>(path, { method: championshipId ? "PUT" : "POST", body: input }))
    .championship
}
export async function deleteChampionship(arenaId: string, championshipId: string) {
  guardWrite()
  await apiRequest(`${base(arenaId)}/championships/${encodeURIComponent(championshipId)}`, { method: "DELETE" })
}
export async function addTeam(arenaId: string, championshipId: string, name: string) {
  guardWrite()
  return (
    await apiRequest<{ championship: Championship }>(
      `${base(arenaId)}/championships/${encodeURIComponent(championshipId)}/teams`,
      { method: "POST", body: { name } },
    )
  ).championship
}
export async function removeTeam(arenaId: string, championshipId: string, teamId: string) {
  guardWrite()
  return (
    await apiRequest<{ championship: Championship }>(
      `${base(arenaId)}/championships/${encodeURIComponent(championshipId)}/teams/${encodeURIComponent(teamId)}`,
      { method: "DELETE" },
    )
  ).championship
}

// Publicações
export async function listPosts(arenaId: string, signal?: AbortSignal) {
  return (await apiRequest<{ posts: ArenaPost[] }>(`${base(arenaId)}/posts`, { signal })).posts ?? []
}
export async function createPost(arenaId: string, input: { kind: PostKind; content: string }) {
  guardWrite()
  return (await apiRequest<{ post: ArenaPost }>(`${base(arenaId)}/posts`, { method: "POST", body: input })).post
}
export async function deletePost(arenaId: string, postId: string) {
  guardWrite()
  await apiRequest(`${base(arenaId)}/posts/${encodeURIComponent(postId)}`, { method: "DELETE" })
}

import type { SportId } from "@/data/courts"

/** Origem dos dados exibidos: servidor real ou módulo de demonstração (src/demo). */
export type DataSource = "api" | "demo"
export interface Sourced<T> {
  data: T
  source: DataSource
}

// ── Identidade e papéis ─────────────────────────────────────────────────────
// Uma única conta por pessoa. Os papéis abaixo são DEVOLVIDOS pelo servidor;
// o frontend nunca os define. "athlete" é o papel base de toda conta.
export type Role = "athlete" | "manager" | "admin"

export interface AuthUser {
  id: string
  email: string
  name?: string
}

export interface AuthSession {
  accessToken: string
  user: AuthUser
}

export interface Account {
  id: string
  email: string
  name: string
  phone?: string
  roles: Role[]
  /** Arenas que a conta tem autorização para administrar (vínculo definido no servidor). */
  managedArenas: { id: string; name: string }[]
}

// ── Catálogo ────────────────────────────────────────────────────────────────
export interface CatalogCourt {
  id: string
  name: string
  sports: SportId[]
  hourlyRate?: number
  capacity?: number
}

export interface CatalogArena {
  id: string
  name: string
  city: string
  state: string
  address?: string
  description?: string
  imageUrl?: string
  sports: SportId[]
  priceFrom?: number
  courts: CatalogCourt[]
}

export interface TimeSlot {
  time: string
  available: boolean
}
export interface CourtAvailability {
  courtId: string
  slots: TimeSlot[]
}

// ── Reservas ────────────────────────────────────────────────────────────────
export interface BookingDraft {
  arenaId: string
  courtId: string
  sport: SportId
  date: string
  time: string
  duration: number
}

export type ReservationStatus = "pendente" | "confirmada" | "cancelada" | "concluida"
export interface Reservation {
  id: string
  arenaId: string
  arenaName: string
  courtName: string
  sport: SportId
  date: string
  time: string
  duration: number
  total?: number
  status: ReservationStatus
  endTime?: string
  /** Calculado pelo servidor: confirmada e ainda não iniciada. */
  canCancel?: boolean
}

// ── Solicitação de arena ────────────────────────────────────────────────────
export type ArenaRequestStatus = "pendente" | "aprovada" | "rejeitada"

export interface ArenaRequestInput {
  name: string
  address: string
  city: string
  state: string
  description: string
  sports: SportId[]
  contactName: string
  contactEmail: string
  contactPhone: string
  instagram?: string
}

export interface ArenaRequest extends ArenaRequestInput {
  id: string
  status: ArenaRequestStatus
  createdAt: string
  decidedAt?: string
  rejectionReason?: string
  requesterName?: string
  requesterEmail?: string
  imageCount?: number
}

// ── Administração da plataforma ─────────────────────────────────────────────
export interface PlatformArena {
  id: string
  name: string
  city: string
  state: string
  status: "ativa" | "inativa"
  imageUrl?: string
  managerName?: string
  courtCount?: number
  /** Reservas confirmadas/concluídas nos últimos 30 dias. */
  reservations30d?: number
  createdAt?: string
}

export interface PlatformUser {
  id: string
  name: string
  email: string
  roles: Role[]
  status: "ativo" | "suspenso"
  arenas: { id: string; name: string }[]
  createdAt?: string
}

export interface PlatformStats {
  arenas: { total: number; active: number; courts?: number }
  requests: { pendente: number; aprovada: number; rejeitada: number }
  users: { total: number; managers: number; suspended: number }
  reservations: { total: number; thisMonth: number }
  revenue?: { reservationsThisMonth: number; salesThisMonth: number }
  /** Últimos 6 meses, do mais antigo ao atual ("AAAA-MM"). */
  monthly?: { month: string; bookings: number; revenue: number; newUsers: number }[]
  topArenas?: { id: string; name: string; city: string; state: string; bookings: number; revenue: number }[]
}

// ── Painel do gestor: quadras ───────────────────────────────────────────────
// Contrato de GET /api/manager/arenas e /api/arenas/:id/courts (ids como string).
export type ManagedCourtStatus = "ativa" | "manutencao" | "inativa"

export interface ManagedCourt {
  id: string
  arenaId: string
  name: string
  sports: SportId[]
  status: ManagedCourtStatus
  capacity?: number
  hourlyRate?: number
  createdAt: string
  updatedAt: string
}

export interface ManagedArena {
  id: string
  name: string
  city: string
  state: string
  courts: ManagedCourt[]
}

/** Corpo aceito por POST/PUT de quadra. arena_id vai só na URL. */
export interface CourtPayload {
  name: string
  sports: SportId[]
  status: ManagedCourtStatus
  capacity: number | null
  hourlyRate: number | null
}

// ── Painel do gestor: reservas, produtos, vendas, campeonatos, publicações ──
export interface ManagerReservation {
  id: string
  arenaId: string
  arenaName: string
  courtId: string
  courtName: string
  sport: SportId
  date: string
  time: string
  endTime: string
  duration: number
  hourlyRate: number
  total: number
  status: "confirmada" | "cancelada" | "concluida"
  notes?: string
  cancellationReason?: string
  canCancel: boolean
  customer: { name?: string; phone?: string }
}

export type ProductCategory = "bebida" | "alimento" | "equipamento" | "combo" | "servico" | "outro"
export interface Product {
  id: string
  arenaId: string
  name: string
  category: ProductCategory
  description?: string
  price: number
  stock?: number
  active: boolean
  soldQuantity: number
}
export interface ProductInput {
  name: string
  category: ProductCategory
  description: string | null
  price: number
  stock: number | null
  active: boolean
}

export interface Sale {
  id: string
  productId: string
  productName: string
  category: ProductCategory
  quantity: number
  unitPrice: number
  total: number
  reservationId?: string
  soldAt: string
}

export type ChampionshipFormat = "mata-mata" | "grupos-mata-mata" | "pontos-corridos"
export type ChampionshipStatus = "inscricoes" | "andamento" | "concluido"
export interface Championship {
  id: string
  arenaId: string
  name: string
  sport: SportId
  format: ChampionshipFormat
  startsOn: string
  endsOn?: string
  maxTeams: number
  entryFee?: number
  status: ChampionshipStatus
  description?: string
  teams: { id: string; name: string }[]
}
export interface ChampionshipInput {
  name: string
  sport: SportId
  format: ChampionshipFormat
  startsOn: string
  endsOn: string | null
  maxTeams: number
  entryFee: number | null
  status: ChampionshipStatus
  description: string | null
}

export type PostKind = "aviso" | "promocao" | "evento" | "resultado"
export interface ArenaPost {
  id: string
  arenaId: string
  kind: PostKind
  content: string
  authorName?: string
  createdAt: string
}

export interface ManagerDashboard {
  periodDays: number
  reservations: { bookings: number; cancelled: number; revenue: number; averageTicket: number; hours: number; customers: number }
  occupancy: { activeCourts: number; bookedHours: number; availableHours: number; rate: number }
  sales: { revenue: number; items: number; count: number; topProducts: { name: string; quantity: number; revenue: number }[] }
  totalRevenue: number
  daily: { date: string; reservationRevenue: number; salesRevenue: number; bookings: number }[]
  bySport: { sport: SportId; bookings: number; revenue: number }[]
  byCourt: { courtId: string; name: string; hours: number; revenue: number; occupancy: number }[]
  upcoming: { id: string; date: string; time: string; endTime: string; sport: SportId; courtName: string; customer: { name?: string; phone?: string } }[]
  championships: { active: number; teams: number }
  posts: number
}

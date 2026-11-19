/**
 * DADOS DE DEMONSTRAÇÃO, TOTALMENTE FICTÍCIOS.
 *
 * Este módulo só é carregado (import dinâmico) quando VITE_ENABLE_DEMO_DATA=true.
 * Serve apenas para apresentar as interfaces. Nada aqui existe no banco de dados e nenhuma
 * escrita é feita a partir dele: os serviços bloqueiam ações de escrita em modo demonstração.
 */
import { timeSlots } from "@/data/courts"
import { todayISO } from "@/lib/format"
import type {
  ArenaRequest,
  CatalogArena,
  CourtAvailability,
  PlatformArena,
  PlatformStats,
  PlatformUser,
  Reservation,
} from "@/types"

export const demoArenas: CatalogArena[] = [
  {
    id: "demo-1",
    name: "Demo · Arena Vila Verde",
    city: "Sorocaba",
    state: "SP",
    address: "Rua Exemplo, 100 (endereço fictício)",
    description:
      "Arena fictícia usada para demonstrar a interface: três quadras de futebol society e duas de areia.",
    sports: ["society", "futsal", "futevolei"],
    priceFrom: 90,
    courts: [
      { id: "demo-1-a", name: "Quadra Society 1", sports: ["society"], hourlyRate: 160, capacity: 14 },
      { id: "demo-1-b", name: "Quadra Futsal", sports: ["futsal"], hourlyRate: 120, capacity: 12 },
      { id: "demo-1-c", name: "Areia 1", sports: ["futevolei", "beach-tennis"], hourlyRate: 90, capacity: 8 },
    ],
  },
  {
    id: "demo-2",
    name: "Demo · Centro Esportivo Litoral",
    city: "Santos",
    state: "SP",
    address: "Avenida Exemplo, 250 (endereço fictício)",
    description: "Arena fictícia com foco em esportes de areia.",
    sports: ["futevolei", "beach-tennis"],
    priceFrom: 70,
    courts: [
      { id: "demo-2-a", name: "Areia Norte", sports: ["futevolei", "beach-tennis"], hourlyRate: 70, capacity: 8 },
      { id: "demo-2-b", name: "Areia Sul", sports: ["beach-tennis"], hourlyRate: 85, capacity: 6 },
    ],
  },
  {
    id: "demo-3",
    name: "Demo · Arena Campinas Sports",
    city: "Campinas",
    state: "SP",
    address: "Rua Fictícia, 45",
    description: "Arena fictícia com quadras cobertas de society e futsal.",
    sports: ["society", "futsal"],
    priceFrom: 110,
    courts: [
      { id: "demo-3-a", name: "Society Coberta", sports: ["society"], hourlyRate: 180, capacity: 14 },
      { id: "demo-3-b", name: "Futsal Coberta", sports: ["futsal"], hourlyRate: 110, capacity: 12 },
    ],
  },
  {
    id: "demo-4",
    name: "Demo · Beach Club Ipanema",
    city: "Rio de Janeiro",
    state: "RJ",
    sports: ["futevolei", "beach-tennis"],
    priceFrom: 100,
    courts: [{ id: "demo-4-a", name: "Quadra Central", sports: ["futevolei", "beach-tennis"], hourlyRate: 100, capacity: 8 }],
  },
]

function hash(text: string) {
  let h = 0
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0
  return h
}

export function demoAvailability(arenaId: string, date: string): CourtAvailability[] {
  const arena = demoArenas.find((item) => item.id === arenaId)
  if (!arena) return []
  return arena.courts.map((court) => ({
    courtId: court.id,
    slots: timeSlots.map((time) => ({
      time,
      available: hash(`${court.id}${date}${time}`) % 3 !== 0,
    })),
  }))
}

export const demoReservations: Reservation[] = [
  { id: "demo-r1", arenaId: "demo-1", arenaName: "Demo · Arena Vila Verde", courtName: "Quadra Society 1", sport: "society", date: todayISO(3), time: "20:00", duration: 1, total: 160, status: "confirmada" },
  { id: "demo-r2", arenaId: "demo-2", arenaName: "Demo · Centro Esportivo Litoral", courtName: "Areia Norte", sport: "futevolei", date: todayISO(7), time: "09:00", duration: 2, total: 140, status: "pendente" },
  { id: "demo-r3", arenaId: "demo-1", arenaName: "Demo · Arena Vila Verde", courtName: "Quadra Futsal", sport: "futsal", date: todayISO(-10), time: "19:00", duration: 1, total: 120, status: "concluida" },
  { id: "demo-r4", arenaId: "demo-3", arenaName: "Demo · Arena Campinas Sports", courtName: "Society Coberta", sport: "society", date: todayISO(-20), time: "21:00", duration: 1, total: 180, status: "cancelada" },
]

const baseRequest = {
  contactName: "Contato Fictício",
  contactEmail: "contato@exemplo.invalid",
  contactPhone: "(00) 00000-0000",
}

export const demoRequests: ArenaRequest[] = [
  { ...baseRequest, id: "demo-q1", name: "Demo · Arena Nova Era", address: "Rua Exemplo, 12", city: "Sorocaba", state: "SP", description: "Solicitação fictícia pendente de análise.", sports: ["society", "futsal"], status: "pendente", createdAt: todayISO(-2), requesterName: "Pessoa Demo 1", requesterEmail: "pessoa1@exemplo.invalid", imageCount: 3 },
  { ...baseRequest, id: "demo-q2", name: "Demo · Quadras do Parque", address: "Av. Exemplo, 800", city: "Votorantim", state: "SP", description: "Outra solicitação fictícia pendente.", sports: ["futevolei"], status: "pendente", createdAt: todayISO(-1), requesterName: "Pessoa Demo 2", requesterEmail: "pessoa2@exemplo.invalid", imageCount: 1 },
  { ...baseRequest, id: "demo-q3", name: "Demo · Arena Aprovada", address: "Rua Exemplo, 33", city: "Campinas", state: "SP", description: "Exemplo de solicitação aprovada.", sports: ["society"], status: "aprovada", createdAt: todayISO(-15), decidedAt: todayISO(-12), requesterName: "Pessoa Demo 3", requesterEmail: "pessoa3@exemplo.invalid" },
  { ...baseRequest, id: "demo-q4", name: "Demo · Arena Rejeitada", address: "Rua Exemplo, 77", city: "Santos", state: "SP", description: "Exemplo de solicitação rejeitada.", sports: ["beach-tennis"], status: "rejeitada", createdAt: todayISO(-20), decidedAt: todayISO(-18), rejectionReason: "Endereço não verificável (motivo fictício de demonstração).", requesterName: "Pessoa Demo 4", requesterEmail: "pessoa4@exemplo.invalid" },
]

export const demoMyRequests: ArenaRequest[] = [demoRequests[0], demoRequests[3]]

export const demoPlatformArenas: PlatformArena[] = [
  { id: "demo-1", name: "Demo · Arena Vila Verde", city: "Sorocaba", state: "SP", status: "ativa", managerName: "Pessoa Demo 5", courtCount: 3, createdAt: todayISO(-120) },
  { id: "demo-2", name: "Demo · Centro Esportivo Litoral", city: "Santos", state: "SP", status: "ativa", managerName: "Pessoa Demo 6", courtCount: 2, createdAt: todayISO(-60) },
  { id: "demo-3", name: "Demo · Arena Campinas Sports", city: "Campinas", state: "SP", status: "inativa", managerName: "Pessoa Demo 7", courtCount: 2, createdAt: todayISO(-30) },
]

export const demoUsers: PlatformUser[] = [
  { id: "demo-u1", name: "Pessoa Demo 5", email: "pessoa5@exemplo.invalid", roles: ["athlete", "manager"], status: "ativo", arenas: [{ id: "demo-1", name: "Demo · Arena Vila Verde" }], createdAt: todayISO(-130) },
  { id: "demo-u2", name: "Pessoa Demo 6", email: "pessoa6@exemplo.invalid", roles: ["athlete", "manager"], status: "ativo", arenas: [{ id: "demo-2", name: "Demo · Centro Esportivo Litoral" }], createdAt: todayISO(-70) },
  { id: "demo-u3", name: "Pessoa Demo 8", email: "pessoa8@exemplo.invalid", roles: ["athlete"], status: "ativo", arenas: [], createdAt: todayISO(-10) },
  { id: "demo-u4", name: "Pessoa Demo 9", email: "pessoa9@exemplo.invalid", roles: ["athlete"], status: "suspenso", arenas: [], createdAt: todayISO(-45) },
]

export const demoStats: PlatformStats = {
  arenas: { total: 3, active: 2 },
  requests: { pendente: 2, aprovada: 1, rejeitada: 1 },
  users: { total: 4, managers: 2, suspended: 1 },
  reservations: { total: 128, thisMonth: 34 },
}

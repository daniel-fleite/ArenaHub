// Regras da tela de Quadras do gestor, sem React nem rede, para poder ser testada isoladamente.
// Os limites espelham a validação do backend (backend/src/services/courtService.ts),
// que continua sendo a autoridade: aqui só evitamos envios que o servidor recusaria.
import type { SportId } from "@/data/courts"
import type { CourtPayload, ManagedArena, ManagedCourt, ManagedCourtStatus } from "@/types"

export const COURT_SPORTS: readonly SportId[] = ["society", "futsal", "futevolei", "beach-tennis"]
export const COURT_STATUSES: readonly ManagedCourtStatus[] = ["ativa", "manutencao", "inativa"]

export const courtStatusLabel: Record<ManagedCourtStatus, string> = {
  ativa: "Ativa",
  manutencao: "Em manutenção",
  inativa: "Inativa",
}

/** Valores do formulário como digitados (números em texto, aceitando vírgula decimal). */
export interface CourtForm {
  name: string
  sports: SportId[]
  status: ManagedCourtStatus
  capacity: string
  hourlyRate: string
}

export type CourtFormErrors = Partial<Record<keyof CourtForm, string>>

export const emptyCourtForm: CourtForm = { name: "", sports: [], status: "ativa", capacity: "", hourlyRate: "" }

export function courtToForm(court: ManagedCourt): CourtForm {
  return {
    name: court.name,
    sports: [...court.sports],
    status: court.status,
    capacity: court.capacity != null ? String(court.capacity) : "",
    hourlyRate: court.hourlyRate != null ? String(court.hourlyRate).replace(".", ",") : "",
  }
}

// Vírgula ou ponto como separador decimal, até 2 casas; sem separador de milhar.
const parseDecimal = (value: string) => Number(value.trim().replace(",", "."))
const looksLikeDecimal = (value: string) => /^\d{1,8}([.,]\d{1,2})?$/.test(value.trim())

export function validateCourtForm(form: CourtForm): CourtFormErrors {
  const errors: CourtFormErrors = {}
  const name = form.name.trim()
  if (name.length < 2 || name.length > 80) errors.name = "Informe o nome da quadra (2 a 80 caracteres)."
  if (form.sports.length === 0) errors.sports = "Selecione ao menos uma modalidade."
  else if (form.sports.some((sport) => !COURT_SPORTS.includes(sport))) errors.sports = "Modalidade inválida."
  if (!COURT_STATUSES.includes(form.status)) errors.status = "Situação inválida."
  if (form.capacity.trim()) {
    const capacity = Number(form.capacity.trim())
    if (!/^\d+$/.test(form.capacity.trim()) || capacity < 1 || capacity > 200) {
      errors.capacity = "Use um número inteiro entre 1 e 200."
    }
  }
  if (form.hourlyRate.trim()) {
    if (!looksLikeDecimal(form.hourlyRate)) errors.hourlyRate = "Use um valor como 120 ou 120,50."
  }
  return errors
}

/** Converte o formulário (já validado) no corpo aceito pelo backend. */
export function toCourtPayload(form: CourtForm): CourtPayload {
  return {
    name: form.name.trim(),
    sports: [...new Set(form.sports)],
    status: form.status,
    capacity: form.capacity.trim() ? Number(form.capacity.trim()) : null,
    hourlyRate: form.hourlyRate.trim() ? parseDecimal(form.hourlyRate) : null,
  }
}

/** Só aceita uma arena que a API devolveu; senão cai na primeira (ou nenhuma). */
export function resolveSelectedArena(arenas: ManagedArena[], selectedId: string | null): string | null {
  if (selectedId && arenas.some((arena) => arena.id === selectedId)) return selectedId
  return arenas[0]?.id ?? null
}

export interface CourtFilters {
  query: string
  sport: "all" | SportId
  status: "all" | ManagedCourtStatus
}

export function filterCourts(courts: ManagedCourt[], { query, sport, status }: CourtFilters): ManagedCourt[] {
  const needle = query.trim().toLowerCase()
  return courts.filter(
    (court) =>
      (!needle || court.name.toLowerCase().includes(needle)) &&
      (sport === "all" || court.sports.includes(sport)) &&
      (status === "all" || court.status === status),
  )
}

export type CourtsPageState = "loading" | "error" | "no-arenas" | "ready"

export function courtsPageState(input: { loading: boolean; error: unknown; arenas: ManagedArena[] | null }): CourtsPageState {
  if (input.loading && !input.arenas) return "loading"
  if (input.error) return "error"
  if (!input.arenas || input.arenas.length === 0) return "no-arenas"
  return "ready"
}

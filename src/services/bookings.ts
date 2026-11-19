import { env } from "@/config/env"
import type { BookingDraft, Reservation, Sourced } from "@/types"
import { apiRequest, DemoModeWriteError } from "./http"

/** GET /api/me/reservations: só as reservas da conta autenticada. */
export async function listMyReservations(signal?: AbortSignal): Promise<Sourced<Reservation[]>> {
  if (env.demoEnabled) {
    const { demoReservations } = await import("@/demo")
    return { data: demoReservations, source: "demo" }
  }
  const res = await apiRequest<{ reservations: Reservation[] }>("/api/me/reservations", { signal })
  return { data: res.reservations ?? [], source: "api" }
}

/**
 * POST /api/reservations. O servidor valida disponibilidade, telefone do perfil e calcula o preço.
 * O resultado só vale como reserva se esta função resolver com a resposta do servidor.
 */
export async function createReservation(draft: BookingDraft): Promise<Reservation> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  const res = await apiRequest<{ reservation: Reservation }>("/api/reservations", {
    method: "POST",
    body: draft,
  })
  return res.reservation
}

/** POST /api/me/reservations/:id/cancel: só a própria reserva, antes do início. */
export async function cancelMyReservation(id: string, reason: string | null): Promise<Reservation> {
  if (env.demoEnabled) throw new DemoModeWriteError()
  const res = await apiRequest<{ reservation: Reservation }>(`/api/me/reservations/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: { reason },
  })
  return res.reservation
}

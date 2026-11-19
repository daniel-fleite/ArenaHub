import { pool, queryWithLegacyFallback } from '../config/database.js'
import { SPORTS } from './arenaRequestService.js'

// Regras de reservas. O banco (trigger reservations_guard, EXCLUDE reservations_no_overlap)
// é a barreira final; aqui validamos antes para responder com mensagens claras.

export const TIME_ZONE = 'America/Sao_Paulo'
/** Relógio substituível nos testes. */
export const clock = { now: () => new Date() }

type DbStatus = 'confirmed' | 'cancelled' | 'completed'
const toApiStatus: Record<DbStatus, 'confirmada' | 'cancelada' | 'concluida'> = {
    confirmed: 'confirmada',
    cancelled: 'cancelada',
    completed: 'concluida',
}

export class ReservationError extends Error {
    constructor(message: string, public status: 400 | 404 | 409 | 422) {
        super(message)
    }
}

/** Data (YYYY-MM-DD) e minutos do dia no fuso das arenas. */
export function localNow(date = clock.now()) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(date).map((p) => [p.type, p.value])
    )
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

/** Instante local (data + hora cheia) já começou? Comparação no fuso das arenas. */
export function hasStarted(date: string, hour: number, now = localNow()) {
    return date < now.date || (date === now.date && hour * 60 <= now.minutes)
}

const isValidDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const d = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export interface CreateInput {
    arenaId: number
    courtId: number
    sport: string
    date: string
    startHour: number
    duration: number
    notes: string | null
}

/** Só os campos de agendamento; preço, usuário, status e datas do corpo são ignorados. */
export function validateCreateInput(body: unknown): { input?: CreateInput; error?: string } {
    const b = (body ?? {}) as Record<string, unknown>
    const arenaId = Number(b.arenaId)
    const courtId = Number(b.courtId)
    if (!Number.isSafeInteger(arenaId) || arenaId <= 0 || !Number.isSafeInteger(courtId) || courtId <= 0) {
        return { error: "Informe a arena e a quadra." }
    }
    if (typeof b.sport !== 'string' || !(SPORTS as readonly string[]).includes(b.sport)) {
        return { error: "Selecione uma modalidade válida." }
    }
    if (typeof b.date !== 'string' || !isValidDate(b.date)) return { error: "Informe uma data válida (AAAA-MM-DD)." }
    const time = typeof b.time === 'string' ? b.time.match(/^([01]\d|2[0-3]):00$/) : null
    if (!time) return { error: "Escolha um horário cheio, como 19:00." }
    const startHour = Number(time[1])
    if (typeof b.duration !== 'number' || !Number.isInteger(b.duration) || b.duration < 1 || b.duration > 8) {
        return { error: "A duração deve ser de 1 a 8 horas." }
    }
    if (startHour + b.duration > 24) return { error: "A reserva precisa terminar no mesmo dia." }
    let notes: string | null = null
    if (b.notes !== undefined && b.notes !== null) {
        if (typeof b.notes !== 'string' || b.notes.trim().length > 500) return { error: "Observação inválida (até 500 caracteres)." }
        notes = b.notes.trim() || null
    }
    return { input: { arenaId, courtId, sport: b.sport, date: b.date, startHour, duration: b.duration, notes } }
}

export function parseId(value: unknown): number | null {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

export const phoneDigits = (phone: string | null | undefined) => (phone ?? '').replace(/\D/g, '').length
export const hasValidPhone = (phone: string | null | undefined) => phoneDigits(phone) >= 10 && phoneDigits(phone) <= 13

const hhmm = (time: string) => String(time).slice(0, 5)
const hourOf = (time: string) => Number(String(time).slice(0, 2))
const isoDate = (value: unknown) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)

/** Formato compatível com o tipo Reservation do frontend (+ campos adicionais). */
export function toApi(row: any, now = localNow()) {
    const date = isoDate(row.reservation_date)
    const start = hourOf(row.start_time)
    const end = String(row.end_time).startsWith('24') ? 24 : hourOf(row.end_time)
    return {
        id: String(row.id),
        arenaId: String(row.arena_id),
        arenaName: row.arena_name,
        courtId: String(row.court_id),
        courtName: row.court_name,
        sport: row.sport,
        date,
        time: hhmm(row.start_time),
        endTime: end === 24 ? '24:00' : hhmm(row.end_time),
        duration: end - start,
        hourlyRate: Number(row.hourly_rate),
        total: Number(row.total_price),
        status: toApiStatus[row.status as DbStatus],
        notes: row.notes ?? undefined,
        cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : undefined,
        cancellationReason: row.cancellation_reason ?? undefined,
        canCancel: row.status === 'confirmed' && !hasStarted(date, start, now),
        createdAt: new Date(row.created_at).toISOString(),
    }
}

/** Erros do banco → respostas previsíveis, sem detalhes internos. */
export function translateDbError(error: unknown): never {
    const e = error as { code?: string; constraint?: string; message?: string }
    if (e?.code === '23P01') throw new ReservationError("Este horário acabou de ser reservado. Escolha outro horário.", 409)
    if (e?.code === '23503' && (e.constraint === 'reservations_court_arena_fkey' || e.message?.includes('não pertence'))) {
        throw new ReservationError("Quadra não encontrada nesta arena.", 404)
    }
    if (e?.code === '22003') throw new ReservationError("Valor da reserva fora do limite permitido.", 422)
    if (e?.code === '23514') {
        const m = e.message ?? ''
        if (m.includes('telefone')) throw new ReservationError("Complete o telefone no seu perfil para reservar.", 422)
        if (m.includes('sem preço')) throw new ReservationError("Esta quadra ainda não tem preço cadastrado.", 422)
        if (m.includes('indisponível')) throw new ReservationError("Esta quadra não está disponível para reservas.", 422)
        if (m.includes('modalidade')) throw new ReservationError("A quadra não oferece esta modalidade.", 422)
        if (m.includes('já começou')) throw new ReservationError("Esse horário já começou ou passou.", 422)
        if (m.includes('cancelar antes')) throw new ReservationError("Só é possível cancelar antes do início da reserva.", 409)
        if (m.includes('finalizada')) throw new ReservationError("Esta reserva já foi encerrada.", 409)
        if (m.includes('concluída')) throw new ReservationError("A reserva ainda não terminou.", 409)
        throw new ReservationError("Dados de reserva inválidos.", 422)
    }
    throw error
}

const SELECT_RESERVATION = `
    SELECT r.*, c.name AS court_name, a.name AS arena_name
    FROM public.reservations r
    JOIN public.courts c ON c.id = r.court_id
    JOIN public.arenas a ON a.id = r.arena_id`

/**
 * Conclui reservas confirmadas cujo fim já passou. Idempotente: só altera as vencidas,
 * e o trigger recusa concluir antes do fim. Restrita ao escopo da listagem.
 */
export async function completeExpired(scope: { userId?: string; arenaId?: number }) {
    const where = scope.userId ? 'AND user_id = $1' : scope.arenaId ? 'AND arena_id = $1' : ''
    const params: unknown[] = scope.userId ? [scope.userId] : scope.arenaId ? [scope.arenaId] : []
    await pool.query(
        `UPDATE public.reservations SET status = 'completed'
         WHERE status = 'confirmed'
           AND private.reservation_instant(reservation_date, end_time) <= now() ${where}`,
        params
    )
}

export async function createReservation(userId: string, input: CreateInput) {
    const profile = await pool.query('SELECT phone FROM public.profiles WHERE id = $1', [userId])
    if (!hasValidPhone(profile.rows[0]?.phone)) {
        throw new ReservationError("Complete o telefone no seu perfil (com DDD) para reservar.", 422)
    }
    const court = await queryWithLegacyFallback(
        `SELECT c.status, c.sports, c.hourly_rate, a.status AS arena_status
         FROM public.courts c JOIN public.arenas a ON a.id = c.arena_id
         WHERE c.id = $1 AND c.arena_id = $2`,
        'SELECT status, sports, hourly_rate FROM public.courts WHERE id = $1 AND arena_id = $2',
        [input.courtId, input.arenaId]
    )
    const c = court.rows[0]
    if (!c) throw new ReservationError("Quadra não encontrada nesta arena.", 404)
    if (c.arena_status === 'inativa') throw new ReservationError("Esta arena não está recebendo reservas no momento.", 422)
    if (c.status !== 'ativa') throw new ReservationError("Esta quadra não está disponível para reservas.", 422)
    if (!(c.sports as string[]).includes(input.sport)) throw new ReservationError("A quadra não oferece esta modalidade.", 422)
    if (c.hourly_rate == null) throw new ReservationError("Esta quadra ainda não tem preço cadastrado.", 422)
    if (hasStarted(input.date, input.startHour)) throw new ReservationError("Esse horário já começou ou passou.", 422)

    const start = `${String(input.startHour).padStart(2, '0')}:00`
    const end = `${String(input.startHour + input.duration).padStart(2, '0')}:00`
    try {
        // hourly_rate e total_price são recalculados pelo trigger a partir da quadra.
        const inserted = await pool.query(
            `INSERT INTO public.reservations
                (court_id, arena_id, user_id, sport, reservation_date, start_time, end_time, hourly_rate, total_price, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $8)
             RETURNING id`,
            [input.courtId, input.arenaId, userId, input.sport, input.date, start, end, input.notes]
        )
        return getReservation(inserted.rows[0].id)
    } catch (error) {
        translateDbError(error)
    }
}

export async function getReservation(id: number) {
    const result = await pool.query(`${SELECT_RESERVATION} WHERE r.id = $1`, [id])
    return result.rows[0] ? toApi(result.rows[0]) : null
}

export async function listOwnReservations(userId: string) {
    await completeExpired({ userId })
    const result = await pool.query(
        `${SELECT_RESERVATION} WHERE r.user_id = $1 ORDER BY r.reservation_date DESC, r.start_time DESC`,
        [userId]
    )
    return result.rows.map((row) => toApi(row))
}

/** Gestão: inclui nome e telefone do responsável. Chamar só depois de autorizar a arena. */
export async function listArenaReservations(arenaId: number, filters: { date?: string; status?: DbStatus }) {
    await completeExpired({ arenaId })
    const params: unknown[] = [arenaId]
    let where = 'WHERE r.arena_id = $1'
    if (filters.date) { params.push(filters.date); where += ` AND r.reservation_date = $${params.length}` }
    if (filters.status) { params.push(filters.status); where += ` AND r.status = $${params.length}` }
    const result = await pool.query(
        `SELECT r.*, c.name AS court_name, a.name AS arena_name, p.full_name AS customer_name, p.phone AS customer_phone
         FROM public.reservations r
         JOIN public.courts c ON c.id = r.court_id
         JOIN public.arenas a ON a.id = r.arena_id
         LEFT JOIN public.profiles p ON p.id = r.user_id
         ${where}
         ORDER BY r.reservation_date, r.start_time`,
        params
    )
    return result.rows.map((row) => ({
        ...toApi(row),
        customer: { name: row.customer_name || undefined, phone: row.customer_phone ?? undefined },
    }))
}

export const parseDbStatus = (value: unknown): DbStatus | undefined =>
    value === 'confirmada' ? 'confirmed' : value === 'cancelada' ? 'cancelled' : value === 'concluida' ? 'completed' : undefined

/**
 * Cancela antes do início. O filtro (dono ou arena) já vem autorizado do controller;
 * reserva fora do filtro responde 404, sem revelar que existe.
 */
export async function cancelReservation(
    id: number,
    actorId: string,
    scope: { userId: string } | { arenaId: number },
    reason: string | null,
) {
    const filter = 'userId' in scope ? 'user_id = $2' : 'arena_id = $2'
    const scopeValue = 'userId' in scope ? scope.userId : scope.arenaId
    const current = await pool.query(
        `SELECT status, reservation_date, start_time FROM public.reservations WHERE id = $1 AND ${filter}`,
        [id, scopeValue]
    )
    const row = current.rows[0]
    if (!row) throw new ReservationError("Reserva não encontrada.", 404)
    if (row.status !== 'confirmed') throw new ReservationError("Esta reserva já foi encerrada.", 409)
    if (hasStarted(isoDate(row.reservation_date), hourOf(row.start_time))) {
        throw new ReservationError("Só é possível cancelar antes do início da reserva.", 409)
    }
    try {
        const result = await pool.query(
            `UPDATE public.reservations
             SET status = 'cancelled', cancelled_by = $3, cancellation_reason = $4
             WHERE id = $1 AND ${filter} AND status = 'confirmed'
             RETURNING id`,
            [id, scopeValue, actorId, reason]
        )
        if (result.rowCount === 0) throw new ReservationError("Esta reserva já foi encerrada.", 409)
    } catch (error) {
        if (error instanceof ReservationError) throw error
        translateDbError(error)
    }
    return getReservation(id)
}

/** Horários de início livres (06:00–22:00, como a tela atual) por quadra ativa. Sem dados pessoais. */
export const SLOT_HOURS = Array.from({ length: 17 }, (_, i) => i + 6)

export async function getAvailability(arenaId: number, date: string) {
    const courts = await queryWithLegacyFallback(
        `SELECT c.id FROM public.courts c JOIN public.arenas a ON a.id = c.arena_id
         WHERE c.arena_id = $1 AND c.status = 'ativa' AND c.hourly_rate IS NOT NULL AND a.status = 'ativa' ORDER BY c.name`,
        `SELECT id FROM public.courts WHERE arena_id = $1 AND status = 'ativa' AND hourly_rate IS NOT NULL ORDER BY name`,
        [arenaId]
    )
    const busy = await pool.query(
        `SELECT court_id, start_time, end_time FROM public.reservations
         WHERE arena_id = $1 AND reservation_date = $2 AND status IN ('confirmed', 'completed')`,
        [arenaId, date]
    )
    const now = localNow()
    return courts.rows.map((court) => {
        const intervals = busy.rows
            .filter((b) => String(b.court_id) === String(court.id))
            .map((b) => [hourOf(b.start_time), String(b.end_time).startsWith('24') ? 24 : hourOf(b.end_time)])
        return {
            courtId: String(court.id),
            slots: SLOT_HOURS.map((hour) => ({
                time: `${String(hour).padStart(2, '0')}:00`,
                available: !hasStarted(date, hour, now) && !intervals.some(([s, e]) => hour >= s && hour < e),
            })),
            busy: intervals.map(([s, e]) => ({
                start: `${String(s).padStart(2, '0')}:00`,
                end: `${String(e).padStart(2, '0')}:00`,
            })),
        }
    })
}

export { isValidDate }

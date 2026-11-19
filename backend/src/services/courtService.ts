import { pool } from '../config/database.js'
import { SPORTS } from './arenaRequestService.js'

export const COURT_STATUSES = ['ativa', 'manutencao', 'inativa'] as const
export type CourtStatus = typeof COURT_STATUSES[number]

export interface CourtInput {
    name: string
    sports: string[]
    status: CourtStatus
    capacity: number | null
    hourlyRate: number | null
}

/**
 * Valida o corpo de criação/edição (PUT substitui todos os campos editáveis).
 * arena_id vem sempre da URL já autorizada; id e datas nunca vêm do cliente.
 */
export function validateCourtInput(body: unknown): { input?: CourtInput; error?: string } {
    const b = (body ?? {}) as Record<string, unknown>
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    if (name.length < 2 || name.length > 80) return { error: "Informe o nome da quadra (2 a 80 caracteres)." }

    const sports = Array.isArray(b.sports) ? [...new Set(b.sports)] : []
    if (sports.length === 0 || sports.length > 10 ||
        sports.some((s) => typeof s !== 'string' || !(SPORTS as readonly string[]).includes(s))) {
        return { error: "Selecione modalidades válidas." }
    }

    const status = b.status === undefined ? 'ativa' : b.status
    if (typeof status !== 'string' || !(COURT_STATUSES as readonly string[]).includes(status)) {
        return { error: "Situação inválida." }
    }

    let capacity: number | null = null
    if (b.capacity !== undefined && b.capacity !== null) {
        if (typeof b.capacity !== 'number' || !Number.isInteger(b.capacity) || b.capacity < 1 || b.capacity > 200) {
            return { error: "A capacidade deve ser um número inteiro entre 1 e 200." }
        }
        capacity = b.capacity
    }

    let hourlyRate: number | null = null
    if (b.hourlyRate !== undefined && b.hourlyRate !== null) {
        if (typeof b.hourlyRate !== 'number' || !Number.isFinite(b.hourlyRate) ||
            b.hourlyRate < 0 || b.hourlyRate > 99_999_999.99 ||
            Math.abs(b.hourlyRate * 100 - Math.round(b.hourlyRate * 100)) > 1e-6) {
            return { error: "O valor por hora deve ser positivo e ter no máximo 2 casas decimais." }
        }
        hourlyRate = b.hourlyRate
    }

    return { input: { name, sports: sports as string[], status: status as CourtStatus, capacity, hourlyRate } }
}

export function parseId(value: unknown): number | null {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function toApi(row: any) {
    return {
        id: String(row.id),
        arenaId: String(row.arena_id),
        name: row.name,
        sports: row.sports,
        status: row.status as CourtStatus,
        capacity: row.capacity ?? undefined,
        // numeric chega do pg como string
        hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : undefined,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
    }
}

/** Erros de banco convertidos em respostas previsíveis. */
export class CourtError extends Error {
    constructor(message: string, public status: 404 | 409) {
        super(message)
    }
}

function translate(error: unknown): never {
    const code = (error as { code?: string })?.code
    if (code === '23505') throw new CourtError("Já existe uma quadra com esse nome nesta arena.", 409)
    if (code === '23503') throw new CourtError("Arena não encontrada.", 404)
    throw error
}

const COLUMNS = 'id, arena_id, name, sports, status, capacity, hourly_rate, created_at, updated_at'

/** Arenas que o usuário gerencia (admin: todas), cada uma com todas as suas quadras. */
export async function listManagedArenas(arenaIds: number[] | 'all') {
    const arenas = arenaIds === 'all'
        ? await pool.query('SELECT id, name, city, state FROM public.arenas ORDER BY name')
        : arenaIds.length === 0
            ? { rows: [] as any[] }
            : await pool.query('SELECT id, name, city, state FROM public.arenas WHERE id = ANY($1::bigint[]) ORDER BY name', [arenaIds])
    if (arenas.rows.length === 0) return []
    const ids = arenas.rows.map((a) => a.id)
    const courts = await pool.query(
        `SELECT ${COLUMNS} FROM public.courts WHERE arena_id = ANY($1::bigint[]) ORDER BY name`,
        [ids]
    )
    return arenas.rows.map((arena) => ({
        id: String(arena.id),
        name: arena.name,
        city: arena.city,
        state: arena.state,
        courts: courts.rows.filter((c) => String(c.arena_id) === String(arena.id)).map(toApi),
    }))
}

/** Somente quadras ativas, para o catálogo público. */
export async function listActiveCourts(arenaId: number) {
    const result = await pool.query(
        `SELECT ${COLUMNS} FROM public.courts WHERE arena_id = $1 AND status = 'ativa' ORDER BY name`,
        [arenaId]
    )
    return result.rows.map(toApi)
}

export async function createCourt(arenaId: number, input: CourtInput) {
    try {
        const result = await pool.query(
            `INSERT INTO public.courts (arena_id, name, sports, status, capacity, hourly_rate)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
            [arenaId, input.name, input.sports, input.status, input.capacity, input.hourlyRate]
        )
        return toApi(result.rows[0])
    } catch (error) {
        translate(error)
    }
}

/** O filtro arena_id + id garante que a quadra pertence à arena autorizada na URL. */
export async function updateCourt(arenaId: number, courtId: number, input: CourtInput) {
    try {
        const result = await pool.query(
            `UPDATE public.courts
             SET name = $3, sports = $4, status = $5, capacity = $6, hourly_rate = $7
             WHERE arena_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
            [arenaId, courtId, input.name, input.sports, input.status, input.capacity, input.hourlyRate]
        )
        if (result.rows.length === 0) throw new CourtError("Quadra não encontrada nesta arena.", 404)
        return toApi(result.rows[0])
    } catch (error) {
        if (error instanceof CourtError) throw error
        translate(error)
    }
}

/** FK de reservas (ON DELETE RESTRICT) impedindo a exclusão. */
export const isBlockedByReservations = (error: unknown) => {
    const e = error as { code?: string; constraint?: string }
    return e?.code === '23503' && e.constraint === 'reservations_court_arena_fkey'
}

export async function deleteCourt(arenaId: number, courtId: number) {
    let result
    try {
        result = await pool.query(
            `DELETE FROM public.courts WHERE arena_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
            [arenaId, courtId]
        )
    } catch (error) {
        if (isBlockedByReservations(error)) {
            throw new CourtError("Esta quadra tem reservas e não pode ser excluída. Altere a situação para Inativa.", 409)
        }
        throw error
    }
    if (result.rows.length === 0) throw new CourtError("Quadra não encontrada nesta arena.", 404)
    return toApi(result.rows[0])
}

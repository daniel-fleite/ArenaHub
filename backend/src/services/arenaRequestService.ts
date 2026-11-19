import { pool } from '../config/database.js'

// Status gravados no banco (inglês) e expostos pela API (português, contrato do frontend).
export type DbStatus = 'pending' | 'approved' | 'rejected'
export type ApiStatus = 'pendente' | 'aprovada' | 'rejeitada'
const toApiStatus: Record<DbStatus, ApiStatus> = { pending: 'pendente', approved: 'aprovada', rejected: 'rejeitada' }
const toDbStatus: Record<ApiStatus, DbStatus> = { pendente: 'pending', aprovada: 'approved', rejeitada: 'rejected' }

export function parseApiStatus(value: unknown): DbStatus | undefined {
    return typeof value === 'string' && value in toDbStatus ? toDbStatus[value as ApiStatus] : undefined
}

export const SPORTS = ['society', 'futsal', 'futevolei', 'beach-tennis'] as const
const STATES = new Set([
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
])

export interface RequestInput {
    name: string
    address: string
    city: string
    state: string
    description: string
    sports: string[]
    contactName: string
    contactEmail: string
    contactPhone: string
    instagram: string | null
}

/** Valida e normaliza apenas os campos do formulário; qualquer outro campo do corpo é ignorado. */
export function validateRequestInput(body: unknown): { input?: RequestInput; error?: string } {
    const b = (body ?? {}) as Record<string, unknown>
    const text = (key: string) => (typeof b[key] === 'string' ? (b[key] as string).trim() : '')
    const input: RequestInput = {
        name: text('name'),
        address: text('address'),
        city: text('city'),
        state: text('state').toUpperCase(),
        description: text('description'),
        sports: Array.isArray(b.sports) ? [...new Set(b.sports.filter((s): s is string => typeof s === 'string'))] : [],
        contactName: text('contactName'),
        contactEmail: text('contactEmail'),
        contactPhone: text('contactPhone'),
        instagram: text('instagram') || null,
    }
    const between = (value: string, min: number, max: number) => value.length >= min && value.length <= max
    if (!between(input.name, 3, 120)) return { error: "Informe o nome da arena (3 a 120 caracteres)." }
    if (!between(input.address, 5, 200)) return { error: "Informe o endereço completo." }
    if (!between(input.city, 2, 80)) return { error: "Informe a cidade." }
    if (!STATES.has(input.state)) return { error: "Estado inválido." }
    if (!between(input.description, 20, 2000)) return { error: "A descrição deve ter entre 20 e 2000 caracteres." }
    if (input.sports.length === 0 || input.sports.some((s) => !(SPORTS as readonly string[]).includes(s))) {
        return { error: "Selecione modalidades válidas." }
    }
    if (!between(input.contactName, 2, 120)) return { error: "Informe o nome do responsável." }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail) || input.contactEmail.length > 254) {
        return { error: "Informe um e-mail de contato válido." }
    }
    if (input.contactPhone.replace(/\D/g, '').length < 10 || input.contactPhone.length > 30) {
        return { error: "Informe um telefone com DDD." }
    }
    if (input.instagram && input.instagram.length > 60) return { error: "Instagram inválido." }
    return { input }
}

export function parseRequestId(value: unknown): number | null {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

const SELECT_REQUEST = `
    SELECT r.*, p.full_name AS requester_name, u.email AS requester_email
    FROM public.arena_requests r
    LEFT JOIN public.profiles p ON p.id = r.requester_id
    LEFT JOIN auth.users u ON u.id = r.requester_id`

export function toApi(row: any, includeRequester: boolean) {
    return {
        id: String(row.id),
        name: row.name,
        address: row.address,
        city: row.city,
        state: row.state,
        description: row.description,
        sports: row.sports,
        contactName: row.contact_name,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
        instagram: row.instagram ?? undefined,
        status: toApiStatus[row.status as DbStatus],
        createdAt: new Date(row.created_at).toISOString(),
        decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : undefined,
        rejectionReason: row.rejection_reason ?? undefined,
        arenaId: row.arena_id != null ? String(row.arena_id) : undefined,
        imageCount: 0,
        ...(includeRequester
            ? { requesterName: row.requester_name || undefined, requesterEmail: row.requester_email ?? undefined }
            : {}),
    }
}

export async function createRequest(requesterId: string, input: RequestInput) {
    const result = await pool.query(
        `INSERT INTO public.arena_requests
            (requester_id, name, address, city, state, description, sports, contact_name, contact_email, contact_phone, instagram)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [requesterId, input.name, input.address, input.city, input.state, input.description, input.sports,
            input.contactName, input.contactEmail, input.contactPhone, input.instagram]
    )
    return toApi(result.rows[0], false)
}

export async function listOwnRequests(requesterId: string) {
    const result = await pool.query(
        'SELECT * FROM public.arena_requests WHERE requester_id = $1 ORDER BY created_at DESC',
        [requesterId]
    )
    return result.rows.map((row) => toApi(row, false))
}

export async function listRequests(status?: DbStatus) {
    const result = status
        ? await pool.query(`${SELECT_REQUEST} WHERE r.status = $1 ORDER BY r.created_at DESC`, [status])
        : await pool.query(`${SELECT_REQUEST} ORDER BY r.created_at DESC`)
    return result.rows.map((row) => toApi(row, true))
}

export async function getRequest(id: number) {
    const result = await pool.query(`${SELECT_REQUEST} WHERE r.id = $1`, [id])
    return result.rows[0] ? toApi(result.rows[0], true) : null
}

export class DecisionError extends Error {
    constructor(message: string, public status: 404 | 409) {
        super(message)
    }
}

/**
 * Aprova em UMA transação: trava a solicitação (FOR UPDATE), confirma que está pendente,
 * cria a arena, vincula o solicitante como gestor e marca como aprovada. Qualquer falha
 * faz ROLLBACK de tudo. O lock impede aprovações concorrentes; arena_id UNIQUE é a segunda barreira.
 */
export async function approveRequest(id: number, adminId: string) {
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        const locked = await client.query('SELECT * FROM public.arena_requests WHERE id = $1 FOR UPDATE', [id])
        const request = locked.rows[0]
        if (!request) throw new DecisionError("Solicitação não encontrada.", 404)
        if (request.status !== 'pending') throw new DecisionError("Esta solicitação já foi decidida.", 409)
        const arena = await client.query(
            'INSERT INTO public.arenas (name, city, state) VALUES ($1, $2, $3) RETURNING id',
            [request.name, request.city, request.state]
        )
        const arenaId = arena.rows[0].id
        await client.query(
            `INSERT INTO public.arena_managers (arena_id, user_id, granted_by) VALUES ($1, $2, $3)
             ON CONFLICT (arena_id, user_id) DO NOTHING`,
            [arenaId, request.requester_id, adminId]
        )
        await client.query(
            `UPDATE public.arena_requests
             SET status = 'approved', decided_by = $2, decided_at = now(), arena_id = $3
             WHERE id = $1 AND status = 'pending'`,
            [id, adminId, arenaId]
        )
        await client.query('COMMIT')
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
    } finally {
        client.release()
    }
    return getRequest(id)
}

export async function rejectRequest(id: number, adminId: string, reason: string | null) {
    const result = await pool.query(
        `UPDATE public.arena_requests
         SET status = 'rejected', decided_by = $2, decided_at = now(), rejection_reason = $3
         WHERE id = $1 AND status = 'pending'
         RETURNING id`,
        [id, adminId, reason]
    )
    if (result.rowCount === 0) {
        const exists = await pool.query('SELECT 1 FROM public.arena_requests WHERE id = $1', [id])
        throw exists.rowCount
            ? new DecisionError("Esta solicitação já foi decidida.", 409)
            : new DecisionError("Solicitação não encontrada.", 404)
    }
    return getRequest(id)
}

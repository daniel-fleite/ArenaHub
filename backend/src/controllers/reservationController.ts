import type { Request, Response } from 'express'
import type { AuthUser } from '../middleware/auth.js'
import * as service from '../services/reservationService.js'

// user_id sempre vem do token; arena da gestão vem da URL já autorizada por requireArenaManager.

const currentUser = (res: Response) => res.locals.user as AuthUser

function fail(res: Response, error: unknown, message: string) {
    if (error instanceof service.ReservationError) return res.status(error.status).json({ error: error.message })
    return res.status(500).json({ error: message })
}

function parseReason(body: unknown): { reason: string | null; error?: string } {
    const raw = (body ?? {} as Record<string, unknown>) as Record<string, unknown>
    if (raw.reason === undefined || raw.reason === null) return { reason: null }
    if (typeof raw.reason !== 'string' || raw.reason.trim().length > 500) {
        return { reason: null, error: "Motivo inválido (até 500 caracteres)." }
    }
    return { reason: raw.reason.trim() || null }
}

export const createReservation = async (req: Request, res: Response) => {
    const { input, error } = service.validateCreateInput(req.body)
    if (!input) return res.status(400).json({ error })
    try {
        return res.status(201).json({ reservation: await service.createReservation(currentUser(res).id, input) })
    } catch (error) {
        return fail(res, error, "Erro interno ao criar a reserva.")
    }
}

export const listMyReservations = async (_req: Request, res: Response) => {
    try {
        return res.status(200).json({ reservations: await service.listOwnReservations(currentUser(res).id) })
    } catch (error) {
        return fail(res, error, "Erro interno ao buscar suas reservas.")
    }
}

export const cancelMyReservation = async (req: Request, res: Response) => {
    const id = service.parseId(req.params.id)
    if (!id) return res.status(400).json({ error: "Informe um ID válido." })
    const { reason, error } = parseReason(req.body)
    if (error) return res.status(400).json({ error })
    const user = currentUser(res)
    try {
        return res.status(200).json({
            reservation: await service.cancelReservation(id, user.id, { userId: user.id }, reason),
        })
    } catch (error) {
        return fail(res, error, "Erro interno ao cancelar a reserva.")
    }
}

export const getAvailability = async (req: Request, res: Response) => {
    const arenaId = service.parseId(req.params.id)
    const date = typeof req.query.date === 'string' ? req.query.date : ''
    if (!arenaId) return res.status(400).json({ error: "Informe um ID válido." })
    if (!service.isValidDate(date)) return res.status(400).json({ error: "Informe uma data válida (AAAA-MM-DD)." })
    try {
        return res.status(200).json({ courts: await service.getAvailability(arenaId, date) })
    } catch (error) {
        return fail(res, error, "Erro interno ao consultar a disponibilidade.")
    }
}

export const listArenaReservations = async (req: Request, res: Response) => {
    const arenaId = service.parseId(req.params.id)
    if (!arenaId) return res.status(400).json({ error: "Informe um ID válido." })
    const date = typeof req.query.date === 'string' ? req.query.date : undefined
    if (date !== undefined && !service.isValidDate(date)) {
        return res.status(400).json({ error: "Informe uma data válida (AAAA-MM-DD)." })
    }
    const status = service.parseDbStatus(req.query.status)
    if (req.query.status !== undefined && !status) return res.status(400).json({ error: "Status inválido." })
    try {
        return res.status(200).json({ reservations: await service.listArenaReservations(arenaId, { date, status }) })
    } catch (error) {
        return fail(res, error, "Erro interno ao buscar as reservas da arena.")
    }
}

export const cancelArenaReservation = async (req: Request, res: Response) => {
    const arenaId = service.parseId(req.params.id)
    const id = service.parseId(req.params.reservationId)
    if (!arenaId || !id) return res.status(400).json({ error: "Informe um ID válido." })
    const { reason, error } = parseReason(req.body)
    if (error) return res.status(400).json({ error })
    try {
        return res.status(200).json({
            reservation: await service.cancelReservation(id, currentUser(res).id, { arenaId }, reason),
        })
    } catch (error) {
        return fail(res, error, "Erro interno ao cancelar a reserva.")
    }
}

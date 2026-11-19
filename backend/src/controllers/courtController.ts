import type { Request, Response } from 'express'
import { loadRoles, type AuthUser } from '../middleware/auth.js'
import * as service from '../services/courtService.js'

// arena_id sempre vem da URL, já autorizada por requireArenaManager; nunca do corpo.

function ids(req: Request, res: Response, withCourt: boolean) {
    const arenaId = service.parseId(req.params.id)
    const courtId = withCourt ? service.parseId(req.params.courtId) : 0
    if (!arenaId || courtId === null) {
        res.status(400).json({ error: "Informe um ID válido." })
        return null
    }
    return { arenaId, courtId }
}

function fail(res: Response, error: unknown, message: string) {
    if (error instanceof service.CourtError) return res.status(error.status).json({ error: error.message })
    return res.status(500).json({ error: message })
}

export const listManagedArenas = async (_req: Request, res: Response) => {
    try {
        const { roles, managedArenaIds } = await loadRoles((res.locals.user as AuthUser).id)
        const arenas = await service.listManagedArenas(roles.includes('admin') ? 'all' : managedArenaIds)
        return res.status(200).json({ arenas })
    } catch (error) {
        return fail(res, error, "Erro interno ao buscar suas arenas.")
    }
}

export const listActiveCourts = async (req: Request, res: Response) => {
    const parsed = ids(req, res, false)
    if (!parsed) return
    try {
        return res.status(200).json({ courts: await service.listActiveCourts(parsed.arenaId) })
    } catch (error) {
        return fail(res, error, "Erro interno ao buscar as quadras.")
    }
}

export const createCourt = async (req: Request, res: Response) => {
    const parsed = ids(req, res, false)
    if (!parsed) return
    const { input, error } = service.validateCourtInput(req.body)
    if (!input) return res.status(400).json({ error })
    try {
        return res.status(201).json({ court: await service.createCourt(parsed.arenaId, input) })
    } catch (error) {
        return fail(res, error, "Erro interno ao cadastrar a quadra.")
    }
}

export const updateCourt = async (req: Request, res: Response) => {
    const parsed = ids(req, res, true)
    if (!parsed) return
    const { input, error } = service.validateCourtInput(req.body)
    if (!input) return res.status(400).json({ error })
    try {
        return res.status(200).json({ court: await service.updateCourt(parsed.arenaId, parsed.courtId, input) })
    } catch (error) {
        return fail(res, error, "Erro interno ao atualizar a quadra.")
    }
}

export const deleteCourt = async (req: Request, res: Response) => {
    const parsed = ids(req, res, true)
    if (!parsed) return
    try {
        return res.status(200).json({ court: await service.deleteCourt(parsed.arenaId, parsed.courtId) })
    } catch (error) {
        return fail(res, error, "Erro interno ao excluir a quadra.")
    }
}

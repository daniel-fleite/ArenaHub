import type { Request, Response } from 'express'
import type { AuthUser } from '../middleware/auth.js'
import * as service from '../services/arenaRequestService.js'

const currentUser = (res: Response) => res.locals.user as AuthUser

// Solicitante, status e decisor vêm sempre do token/servidor, nunca do corpo.
export const createArenaRequest = async (req: Request, res: Response) => {
    const { input, error } = service.validateRequestInput(req.body)
    if (!input) return res.status(400).json({ error })
    try {
        const request = await service.createRequest(currentUser(res).id, input)
        return res.status(201).json({ request })
    } catch {
        return res.status(500).json({ error: "Erro interno ao registrar a solicitação." })
    }
}

export const listMyArenaRequests = async (_req: Request, res: Response) => {
    try {
        return res.status(200).json({ requests: await service.listOwnRequests(currentUser(res).id) })
    } catch {
        return res.status(500).json({ error: "Erro interno ao buscar suas solicitações." })
    }
}

export const listArenaRequests = async (req: Request, res: Response) => {
    const status = service.parseApiStatus(req.query.status)
    if (req.query.status !== undefined && !status) {
        return res.status(400).json({ error: "Status inválido." })
    }
    try {
        return res.status(200).json({ requests: await service.listRequests(status) })
    } catch {
        return res.status(500).json({ error: "Erro interno ao buscar solicitações." })
    }
}

export const getArenaRequest = async (req: Request, res: Response) => {
    const id = service.parseRequestId(req.params.id)
    if (!id) return res.status(400).json({ error: "Informe um ID válido." })
    try {
        const request = await service.getRequest(id)
        if (!request) return res.status(404).json({ error: "Solicitação não encontrada." })
        return res.status(200).json({ request })
    } catch {
        return res.status(500).json({ error: "Erro interno ao buscar a solicitação." })
    }
}

async function decide(res: Response, action: () => Promise<unknown>, failure: string) {
    try {
        return res.status(200).json({ request: await action() })
    } catch (error) {
        if (error instanceof service.DecisionError) {
            return res.status(error.status).json({ error: error.message })
        }
        return res.status(500).json({ error: failure })
    }
}

export const approveArenaRequest = async (req: Request, res: Response) => {
    const id = service.parseRequestId(req.params.id)
    if (!id) return res.status(400).json({ error: "Informe um ID válido." })
    return decide(res, () => service.approveRequest(id, currentUser(res).id),
        "Erro interno ao aprovar. Nenhuma alteração foi gravada.")
}

export const rejectArenaRequest = async (req: Request, res: Response) => {
    const id = service.parseRequestId(req.params.id)
    if (!id) return res.status(400).json({ error: "Informe um ID válido." })
    const raw = (req.body ?? {}).reason
    if (raw !== undefined && raw !== null && typeof raw !== 'string') {
        return res.status(400).json({ error: "Motivo inválido." })
    }
    const reason = typeof raw === 'string' && raw.trim() ? raw.trim() : null
    if (reason && reason.length > 1000) return res.status(400).json({ error: "O motivo deve ter até 1000 caracteres." })
    return decide(res, () => service.rejectRequest(id, currentUser(res).id, reason),
        "Erro interno ao rejeitar a solicitação.")
}

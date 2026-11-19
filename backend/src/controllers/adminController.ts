import type { Request, Response } from 'express'
import type { AuthUser } from '../middleware/auth.js'
import * as service from '../services/adminService.js'

// Todas as rotas passam por requireAuth + requireAdmin.

const actor = (res: Response) => (res.locals.user as AuthUser).id

function route(failure: string, handler: (req: Request, res: Response) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
        try {
            return res.status(200).json(await handler(req, res))
        } catch (error) {
            if (error instanceof service.AdminError) return res.status(error.status).json({ error: error.message })
            if ((error as { code?: string })?.code === '42703') {
                return res.status(503).json({ error: "A migração da administração (20261119000100) ainda não foi aplicada no banco." })
            }
            return res.status(500).json({ error: failure })
        }
    }
}

function arenaIdOf(req: Request, param = 'arenaId') {
    const id = service.parseId(req.params[param])
    if (!id) throw new service.AdminError("Informe um ID válido.", 400)
    return id
}

export const getStats = route("Erro interno ao calcular os indicadores.", async () =>
    ({ stats: await service.getStats() }))

export const listArenas = route("Erro interno ao buscar as arenas.", async () =>
    ({ arenas: await service.listArenas() }))

export const updateArena = route("Erro interno ao atualizar a arena.", async (req) => {
    const { input, error } = service.validateArenaUpdate(req.body)
    if (!input) throw new service.AdminError(error ?? "Dados inválidos.", 400)
    return { arena: await service.updateArena(arenaIdOf(req, 'id'), input) }
})

export const listUsers = route("Erro interno ao buscar os usuários.", async () =>
    ({ users: await service.listUsers() }))

export const setUserStatus = route("Erro interno ao alterar a situação da conta.", async (req, res) =>
    ({ user: await service.setUserStatus(actor(res), service.parseUserId(req.params.id), (req.body ?? {}).status) }))

export const grantArena = route("Erro interno ao vincular a arena.", async (req, res) => {
    const arenaId = service.parseId((req.body ?? {}).arenaId)
    if (!arenaId) throw new service.AdminError("Selecione a arena.", 400)
    return { user: await service.grantArena(actor(res), service.parseUserId(req.params.id), arenaId) }
})

export const revokeArena = route("Erro interno ao revogar o acesso.", async (req) =>
    ({ user: await service.revokeArena(service.parseUserId(req.params.id), arenaIdOf(req)) }))

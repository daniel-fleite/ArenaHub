import type { Request, Response } from 'express'
import type { AuthUser } from '../middleware/auth.js'
import * as service from '../services/managerService.js'

// Todas as rotas passam por requireAuth + requireArenaManager: a arena (:id) já está autorizada.

const currentUser = (res: Response) => res.locals.user as AuthUser

type Handler = (arenaId: number, req: Request, res: Response) => Promise<unknown>

/** Valida :id, executa e converte erros conhecidos; demais erros viram 500 genérico. */
function route(failure: string, handler: Handler, successStatus = 200) {
    return async (req: Request, res: Response) => {
        const arenaId = service.parseId(req.params.id)
        if (!arenaId) return res.status(400).json({ error: "Informe um ID válido." })
        try {
            const body = await handler(arenaId, req, res)
            if (res.headersSent) return
            return body === undefined ? res.status(204).end() : res.status(successStatus).json(body)
        } catch (error) {
            if (error instanceof service.ManagerError) return res.status(error.status).json({ error: error.message })
            return res.status(500).json({ error: failure })
        }
    }
}

function requireId(req: Request, param: string) {
    const id = service.parseId(req.params[param])
    if (!id) throw new service.ManagerError("Informe um ID válido.", 400)
    return id
}

function validated<T>(result: { input?: T; error?: string }): T {
    if (!result.input) throw new service.ManagerError(result.error ?? "Dados inválidos.", 400)
    return result.input
}

export const getDashboard = route("Erro interno ao calcular os indicadores.", async (arenaId, req) => {
    const days = req.query.days === undefined ? 30 : Number(req.query.days)
    if (![7, 30, 90].includes(days)) throw new service.ManagerError("Período inválido (7, 30 ou 90 dias).", 400)
    return { dashboard: await service.getDashboard(arenaId, days) }
})

export const listProducts = route("Erro interno ao buscar os produtos.", async (arenaId) =>
    ({ products: await service.listProducts(arenaId) }))
export const createProduct = route("Erro interno ao cadastrar o produto.", async (arenaId, req) =>
    ({ product: await service.createProduct(arenaId, validated(service.validateProduct(req.body))) }), 201)
export const updateProduct = route("Erro interno ao atualizar o produto.", async (arenaId, req) =>
    ({ product: await service.updateProduct(arenaId, requireId(req, 'productId'), validated(service.validateProduct(req.body))) }))
export const deleteProduct = route("Erro interno ao excluir o produto.", async (arenaId, req) => {
    await service.deleteProduct(arenaId, requireId(req, 'productId'))
})

export const listSales = route("Erro interno ao buscar as vendas.", async (arenaId) =>
    ({ sales: await service.listSales(arenaId) }))
export const createSale = route("Erro interno ao registrar a venda.", async (arenaId, req, res) =>
    ({ sale: await service.createSale(arenaId, currentUser(res).id, validated(service.validateSale(req.body))) }), 201)
export const deleteSale = route("Erro interno ao estornar a venda.", async (arenaId, req) => {
    await service.deleteSale(arenaId, requireId(req, 'saleId'))
})

export const listChampionships = route("Erro interno ao buscar os campeonatos.", async (arenaId) =>
    ({ championships: await service.listChampionships(arenaId) }))
export const createChampionship = route("Erro interno ao criar o campeonato.", async (arenaId, req) =>
    ({ championship: await service.createChampionship(arenaId, validated(service.validateChampionship(req.body))) }), 201)
export const updateChampionship = route("Erro interno ao atualizar o campeonato.", async (arenaId, req) =>
    ({ championship: await service.updateChampionship(arenaId, requireId(req, 'championshipId'), validated(service.validateChampionship(req.body))) }))
export const deleteChampionship = route("Erro interno ao excluir o campeonato.", async (arenaId, req) => {
    await service.deleteChampionship(arenaId, requireId(req, 'championshipId'))
})
export const addTeam = route("Erro interno ao inscrever a equipe.", async (arenaId, req) =>
    ({ championship: await service.addTeam(arenaId, requireId(req, 'championshipId'), req.body) }), 201)
export const removeTeam = route("Erro interno ao remover a equipe.", async (arenaId, req) =>
    ({ championship: await service.removeTeam(arenaId, requireId(req, 'championshipId'), requireId(req, 'teamId')) }))

export const listPosts = route("Erro interno ao buscar as publicações.", async (arenaId) =>
    ({ posts: await service.listPosts(arenaId) }))
export const createPost = route("Erro interno ao publicar.", async (arenaId, req, res) =>
    ({ post: await service.createPost(arenaId, currentUser(res).id, req.body) }), 201)
export const deletePost = route("Erro interno ao excluir a publicação.", async (arenaId, req) => {
    await service.deletePost(arenaId, requireId(req, 'postId'))
})

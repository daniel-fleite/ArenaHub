import type { NextFunction, Request, Response } from 'express'
import { pool, queryWithLegacyFallback } from '../config/database.js'

export interface AuthUser {
    id: string
    email: string
}

export type Role = 'athlete' | 'manager' | 'admin'

const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

/**
 * Valida o token Bearer no próprio Supabase Auth (GET /auth/v1/user).
 * Usa apenas a chave pública (publishable/anon); nunca a service_role.
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    if (!supabaseUrl || !supabaseKey) {
        return res.status(503).json({ error: "Autenticação não configurada no servidor." })
    }
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) {
        return res.status(401).json({ error: "Faça login para continuar." })
    }
    try {
        const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
        })
        if (response.status === 401 || response.status === 403) {
            return res.status(401).json({ error: "Sessão inválida ou expirada. Entre novamente." })
        }
        if (!response.ok) {
            return res.status(503).json({ error: "Não foi possível validar a sessão." })
        }
        const user = await response.json() as { id?: unknown; email?: unknown }
        if (typeof user.id !== 'string') {
            return res.status(401).json({ error: "Sessão inválida." })
        }
        // Conta suspensa pela administração: bloqueada em todas as rotas autenticadas.
        const profile = await queryWithLegacyFallback(
            'SELECT status FROM public.profiles WHERE id = $1',
            "SELECT 'ativo' AS status",
            [user.id]
        )
        if (profile.rows[0]?.status === 'suspenso') {
            return res.status(403).json({ error: "Sua conta está suspensa. Fale com a administração do ArenaHub." })
        }
        res.locals.user = { id: user.id, email: typeof user.email === 'string' ? user.email : '' } satisfies AuthUser
        return next()
    } catch {
        return res.status(503).json({ error: "Não foi possível validar a sessão." })
    }
}

/** Papéis consultados no banco a cada requisição; nunca vêm do cliente. */
export async function loadRoles(userId: string): Promise<{ roles: Role[]; managedArenaIds: number[] }> {
    const result = await pool.query(
        `SELECT
            EXISTS (SELECT 1 FROM public.profiles WHERE id = $1) AS has_profile,
            EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = $1) AS is_admin,
            COALESCE((SELECT array_agg(arena_id) FROM public.arena_managers WHERE user_id = $1), '{}') AS arena_ids`,
        [userId]
    )
    const row = result.rows[0]
    const managedArenaIds = (row.arena_ids as (string | number)[]).map(Number)
    const roles: Role[] = []
    if (row.has_profile) roles.push('athlete')
    if (managedArenaIds.length > 0) roles.push('manager')
    if (row.is_admin) roles.push('admin')
    return { roles, managedArenaIds }
}

export const requireAdmin = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const { roles } = await loadRoles((res.locals.user as AuthUser).id)
        if (!roles.includes('admin')) {
            return res.status(403).json({ error: "Ação restrita à administração da plataforma." })
        }
        return next()
    } catch {
        return res.status(500).json({ error: "Erro interno ao verificar permissões." })
    }
}

/** Admin ou gestor com vínculo autorizado à arena de :id. */
export const requireArenaManager = async (req: Request, res: Response, next: NextFunction) => {
    const arenaId = Number(req.params.id)
    try {
        const { roles, managedArenaIds } = await loadRoles((res.locals.user as AuthUser).id)
        if (roles.includes('admin') || managedArenaIds.includes(arenaId)) return next()
        return res.status(403).json({ error: "Você não tem permissão para gerenciar esta arena." })
    } catch {
        return res.status(500).json({ error: "Erro interno ao verificar permissões." })
    }
}

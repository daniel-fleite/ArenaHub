import type { Request, Response } from 'express'
import { pool } from '../config/database.js'
import { loadRoles, type AuthUser } from '../middleware/auth.js'

async function buildAccount(user: AuthUser) {
    const profile = await pool.query(
        'SELECT full_name, phone FROM public.profiles WHERE id = $1',
        [user.id]
    )
    if (profile.rows.length === 0) return null
    const { roles, managedArenaIds } = await loadRoles(user.id)
    const arenas = managedArenaIds.length > 0
        ? await pool.query('SELECT id, name FROM public.arenas WHERE id = ANY($1::bigint[]) ORDER BY name', [managedArenaIds])
        : { rows: [] as { id: number; name: string }[] }
    return {
        id: user.id,
        email: user.email,
        name: profile.rows[0].full_name as string,
        phone: (profile.rows[0].phone as string | null) ?? undefined,
        roles,
        managedArenas: arenas.rows.map((arena) => ({ id: String(arena.id), name: arena.name })),
    }
}

export const getMe = async (_req: Request, res: Response) => {
    try {
        const account = await buildAccount(res.locals.user as AuthUser)
        if (!account) {
            return res.status(404).json({ error: "Perfil não encontrado para esta conta." })
        }
        return res.status(200).json({ account })
    } catch {
        return res.status(500).json({ error: "Erro interno ao carregar a conta." })
    }
}

export const updateMe = async (req: Request, res: Response) => {
    const user = res.locals.user as AuthUser
    // Só nome e telefone: papéis e vínculos nunca são aceitos do corpo da requisição.
    const { name, phone } = req.body ?? {}
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) {
        return res.status(400).json({ error: "Informe um nome entre 2 e 120 caracteres." })
    }
    // Vazio = sem telefone. Preenchido: com DDD (10 a 13 dígitos), o mesmo exigido para reservar.
    const digits = typeof phone === 'string' ? phone.replace(/\D/g, '').length : 0
    if (phone !== undefined && phone !== null && phone !== '' &&
        (typeof phone !== 'string' || phone.trim().length > 30 || digits < 10 || digits > 13)) {
        return res.status(400).json({ error: "Informe o telefone com DDD, por exemplo (15) 99999-0000." })
    }
    try {
        const result = await pool.query(
            'UPDATE public.profiles SET full_name = $1, phone = $2 WHERE id = $3',
            [name.trim(), typeof phone === 'string' && phone.trim() ? phone.trim() : null, user.id]
        )
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Perfil não encontrado para esta conta." })
        }
        return res.status(200).json({ account: await buildAccount(user) })
    } catch {
        return res.status(500).json({ error: "Erro interno ao atualizar o perfil." })
    }
}

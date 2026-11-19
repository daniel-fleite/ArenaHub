import type { Request, Response } from 'express'
import { pool, queryWithLegacyFallback } from '../config/database.js'
import { isBlockedByReservations } from '../services/courtService.js'

/**
 * Catálogo público: anexa às arenas as quadras ativas com preço (as únicas reserváveis).
 * hourly_rate vem do pg como string (numeric) e é convertido para número.
 */
async function withActiveCourts(arenas: any[]) {
    if (arenas.length === 0) return arenas
    const courts = await pool.query(
        `SELECT id, arena_id, name, sports, capacity, hourly_rate FROM public.courts
         WHERE arena_id = ANY($1::bigint[]) AND status = 'ativa' AND hourly_rate IS NOT NULL
         ORDER BY name`,
        [arenas.map((arena) => arena.id)]
    )
    return arenas.map((arena) => ({
        ...arena,
        courts: courts.rows
            .filter((court) => String(court.arena_id) === String(arena.id))
            .map((court) => ({
                id: String(court.id),
                name: court.name,
                sports: court.sports,
                capacity: court.capacity ?? undefined,
                hourly_rate: Number(court.hourly_rate),
            })),
    }))
}

export const getAllArenas = async (req: Request, res: Response) => {
    try {
        const result = await queryWithLegacyFallback(
            "SELECT * FROM public.arenas WHERE status = 'ativa' ORDER BY name",
            'SELECT * FROM public.arenas ORDER BY name'
        )
        return res.status(200).json({
            message: "Busca concluída com sucesso!",
            arenas: await withActiveCourts(result.rows)
        })
    } catch(error) {
        return res.status(500).json({
            error: "Erro interno ao buscar arenas."
        })
    }
}

export const getArenaById = async (req: Request, res: Response) => {
    const { id } = req.params
    const arenaId = Number(id)
    if(!Number.isInteger(arenaId) || arenaId <= 0) {
        return res.status(400).json({
        error: "Informe um ID válido."
        })
    }
    try {
        const result = await queryWithLegacyFallback(
            "SELECT * FROM public.arenas WHERE id = $1 AND status = 'ativa'",
            'SELECT * FROM public.arenas WHERE id = $1',
            [arenaId]
        )
        if(result.rows.length === 0) {
            return res.status(404).json({
                error: "Nenhuma arena encontrada."
            })
        }
        const [arena] = await withActiveCourts(result.rows)
        return res.status(200).json({
            message: "Busca concluída com sucesso!",
            arena
        })
    } catch(error) {
        return res.status(500).json({
            error: "Erro interno ao buscar a arena."
        })
    }
}

export const createArena = async (req: Request, res: Response) => {
    const { name, city, state } = req.body
    if(typeof name !== 'string' || !name.trim() || 
        typeof city !== 'string' || !city.trim() ||
        typeof state !== 'string' || !state.trim()
    ) {
    return res.status(400).json({
       error: "Nome, cidade e estado são obrigatórios." 
    })
    }
    try {
        const result = await pool.query(
            'INSERT INTO public.arenas (name, city, state) VALUES ($1, $2, $3) RETURNING *',
            [name.trim(), city.trim(), state.trim().toUpperCase()]
        )
        return res.status(201).json({
            message: "Arena criada com sucesso!",
            arena: result.rows[0]
    })
    } catch(error) {
        return res.status(500).json({
            error: "Erro interno ao adicionar arena."
        })
    }
}

export const updateArena = async (req: Request, res: Response) => {
    const { id } = req.params
    const { name, city, state } = req.body
    const arenaId = Number(id)
    if(!Number.isInteger(arenaId) || arenaId <= 0) {
        return res.status(400).json({
            error: "Informe um ID válido."
        })
    }
    if( typeof name !== 'string' || !name.trim() || 
        typeof city !== 'string' || !city.trim() ||
        typeof state !== 'string' || !state.trim()
    ) {
    return res.status(400).json({
       error: "Nome, cidade e estado são obrigatórios." 
    })
    }
    try {
        const result = await pool.query(
            'UPDATE public.arenas SET name = $1, city = $2, state = $3 WHERE id = $4 RETURNING *',
            [name.trim(), city.trim(), state.trim().toUpperCase(), arenaId]
        )
        if(result.rows.length === 0) {
            return res.status(404).json({
                error: "Arena não encontrada."
            })
        }
        return res.status(200).json({
            message: "Arena atualizada com sucesso!",
            arena: result.rows[0]
        })
    } catch(error) {
        return res.status(500).json({
            error: "Erro interno ao atualizar a arena."
        })
    }
}

export const deleteArena = async (req: Request, res: Response) => {
    const { id } = req.params
    const arenaId = Number(id)
    if(!Number.isInteger(arenaId) || arenaId <= 0) {
        return res.status(400).json({
            error: "Informe um ID válido."
        })
    }
    try {
        const result = await pool.query(
            'DELETE FROM public.arenas WHERE id = $1 RETURNING *',
            [arenaId]
        )
        if(result.rows.length === 0) {
            return res.status(404).json({
                error: "Arena não encontrada."
            })
        }
        return res.status(200).json({
            message: "Arena deletada com sucesso!",
            arena: result.rows[0]
        })
    } catch(error) {
        // Quadras da arena com reservas (FK ON DELETE RESTRICT) bloqueiam a exclusão.
        if ((error as { code?: string }).code === '23503') {
            return res.status(409).json({
                error: isBlockedByReservations(error)
                    ? "Esta arena tem quadras com reservas e não pode ser excluída. Inative as quadras."
                    : "Esta arena possui registros vinculados e não pode ser excluída."
            })
        }
        return res.status(500).json({
            error: "Erro interno ao deletar a arena."
        })
    }
}
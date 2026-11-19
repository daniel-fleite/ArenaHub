import { pool } from '../config/database.js'
import { completeExpired } from './reservationService.js'

// Administração da plataforma. Todas as rotas passam por requireAuth + requireAdmin.
// Depende da migração 20261119000100_admin_and_photos.sql (arenas.status/image_url/created_at,
// profiles.status). O papel de admin NUNCA é concedido ou removido por aqui (só via SQL).

export class AdminError extends Error {
    constructor(message: string, public status: 400 | 404 | 409 | 422) {
        super(message)
    }
}

export function parseId(value: unknown): number | null {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}
const isUuid = (value: unknown): value is string =>
    typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export function parseUserId(value: unknown) {
    if (!isUuid(value)) throw new AdminError("Usuário inválido.", 400)
    return value
}
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : undefined)
const today = `(now() AT TIME ZONE 'America/Sao_Paulo')::date`

// ── Indicadores ─────────────────────────────────────────────────────────────
export async function getStats() {
    await completeExpired({})
    const [main, monthly, topArenas, signups] = await Promise.all([
        pool.query(`SELECT
            (SELECT count(*) FROM public.arenas) AS arenas_total,
            (SELECT count(*) FROM public.arenas WHERE status = 'ativa') AS arenas_active,
            (SELECT count(*) FROM public.courts WHERE status = 'ativa') AS courts_active,
            (SELECT count(*) FROM public.arena_requests WHERE status = 'pending') AS req_pending,
            (SELECT count(*) FROM public.arena_requests WHERE status = 'approved') AS req_approved,
            (SELECT count(*) FROM public.arena_requests WHERE status = 'rejected') AS req_rejected,
            (SELECT count(*) FROM public.profiles) AS users_total,
            (SELECT count(DISTINCT user_id) FROM public.arena_managers) AS users_managers,
            (SELECT count(*) FROM public.profiles WHERE status = 'suspenso') AS users_suspended,
            (SELECT count(*) FROM public.reservations WHERE status IN ('confirmed', 'completed')) AS res_total,
            (SELECT count(*) FROM public.reservations WHERE status IN ('confirmed', 'completed')
                AND date_trunc('month', reservation_date) = date_trunc('month', ${today})) AS res_month,
            (SELECT COALESCE(sum(total_price), 0) FROM public.reservations WHERE status IN ('confirmed', 'completed')
                AND date_trunc('month', reservation_date) = date_trunc('month', ${today})) AS res_revenue_month,
            (SELECT COALESCE(sum(total), 0) FROM public.sales
                WHERE date_trunc('month', sold_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', ${today})) AS sales_revenue_month`),
        pool.query(`SELECT to_char(m, 'YYYY-MM') AS month,
                (SELECT count(*) FROM public.reservations r WHERE r.status IN ('confirmed', 'completed')
                    AND date_trunc('month', r.reservation_date) = m) AS bookings,
                (SELECT COALESCE(sum(r.total_price), 0) FROM public.reservations r WHERE r.status IN ('confirmed', 'completed')
                    AND date_trunc('month', r.reservation_date) = m) AS revenue
            FROM generate_series(date_trunc('month', ${today}) - interval '5 months', date_trunc('month', ${today}), interval '1 month') AS m
            ORDER BY m`),
        pool.query(`SELECT a.id, a.name, a.city, a.state,
                count(r.id) AS bookings, COALESCE(sum(r.total_price), 0) AS revenue
            FROM public.arenas a
            JOIN public.reservations r ON r.arena_id = a.id AND r.status IN ('confirmed', 'completed')
                AND r.reservation_date BETWEEN ${today} - 29 AND ${today}
            GROUP BY a.id ORDER BY bookings DESC, a.name LIMIT 5`),
        pool.query(`SELECT to_char(m, 'YYYY-MM') AS month,
                (SELECT count(*) FROM public.profiles p WHERE date_trunc('month', p.created_at AT TIME ZONE 'America/Sao_Paulo') = m) AS users
            FROM generate_series(date_trunc('month', ${today}) - interval '5 months', date_trunc('month', ${today}), interval '1 month') AS m
            ORDER BY m`),
    ])
    const s = main.rows[0]
    const n = (v: unknown) => Number(v)
    return {
        arenas: { total: n(s.arenas_total), active: n(s.arenas_active), courts: n(s.courts_active) },
        requests: { pendente: n(s.req_pending), aprovada: n(s.req_approved), rejeitada: n(s.req_rejected) },
        users: { total: n(s.users_total), managers: n(s.users_managers), suspended: n(s.users_suspended) },
        reservations: { total: n(s.res_total), thisMonth: n(s.res_month) },
        revenue: { reservationsThisMonth: n(s.res_revenue_month), salesThisMonth: n(s.sales_revenue_month) },
        monthly: monthly.rows.map((row, i) => ({
            month: row.month, bookings: n(row.bookings), revenue: n(row.revenue), newUsers: n(signups.rows[i]?.users ?? 0),
        })),
        topArenas: topArenas.rows.map((row) => ({
            id: String(row.id), name: row.name, city: row.city, state: row.state, bookings: n(row.bookings), revenue: n(row.revenue),
        })),
    }
}

// ── Arenas ──────────────────────────────────────────────────────────────────
const ARENAS_SQL = `
    SELECT a.id, a.name, a.city, a.state, a.status, a.image_url, a.created_at,
        (SELECT count(*) FROM public.courts c WHERE c.arena_id = a.id) AS court_count,
        (SELECT count(*) FROM public.reservations r WHERE r.arena_id = a.id AND r.status IN ('confirmed', 'completed')
            AND r.reservation_date BETWEEN ${today} - 29 AND ${today}) AS reservations_30d,
        (SELECT string_agg(COALESCE(NULLIF(p.full_name, ''), u.email), ', ' ORDER BY p.full_name)
            FROM public.arena_managers m
            JOIN auth.users u ON u.id = m.user_id
            LEFT JOIN public.profiles p ON p.id = m.user_id
            WHERE m.arena_id = a.id) AS manager_names
    FROM public.arenas a`

const arenaToApi = (row: any) => ({
    id: String(row.id),
    name: row.name,
    city: row.city,
    state: row.state,
    status: row.status,
    imageUrl: row.image_url ?? undefined,
    managerName: row.manager_names ?? undefined,
    courtCount: Number(row.court_count),
    reservations30d: Number(row.reservations_30d),
    createdAt: iso(row.created_at),
})

export async function listArenas() {
    const result = await pool.query(`${ARENAS_SQL} ORDER BY a.name`)
    return result.rows.map(arenaToApi)
}

export function validateArenaUpdate(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const update: { status?: 'ativa' | 'inativa'; imageUrl?: string | null } = {}
    if (b.status !== undefined) {
        if (b.status !== 'ativa' && b.status !== 'inativa') return { error: "Situação inválida." }
        update.status = b.status
    }
    if (b.imageUrl !== undefined) {
        if (b.imageUrl === null || b.imageUrl === '') update.imageUrl = null
        else if (typeof b.imageUrl !== 'string' || b.imageUrl.trim().length > 1000) return { error: "URL da foto inválida." }
        else {
            let url: URL
            try {
                url = new URL(b.imageUrl.trim())
            } catch {
                return { error: "URL da foto inválida." }
            }
            if (url.protocol !== 'https:') return { error: "A foto precisa ser um endereço https://." }
            update.imageUrl = url.toString()
        }
    }
    if (update.status === undefined && update.imageUrl === undefined) return { error: "Nada para atualizar." }
    return { input: update }
}

export async function updateArena(arenaId: number, update: { status?: string; imageUrl?: string | null }) {
    const result = await pool.query(
        `UPDATE public.arenas SET
            status = COALESCE($2, status),
            image_url = CASE WHEN $3::boolean THEN $4 ELSE image_url END
         WHERE id = $1 RETURNING id`,
        [arenaId, update.status ?? null, update.imageUrl !== undefined, update.imageUrl ?? null]
    )
    if (!result.rows[0]) throw new AdminError("Arena não encontrada.", 404)
    const fresh = await pool.query(`${ARENAS_SQL} WHERE a.id = $1`, [arenaId])
    return arenaToApi(fresh.rows[0])
}

// ── Usuários ────────────────────────────────────────────────────────────────
const USERS_SQL = `
    SELECT u.id, u.email, u.created_at, p.full_name, p.status,
        EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = u.id) AS is_admin,
        COALESCE((SELECT json_agg(json_build_object('id', a.id::text, 'name', a.name) ORDER BY a.name)
            FROM public.arena_managers m JOIN public.arenas a ON a.id = m.arena_id
            WHERE m.user_id = u.id), '[]'::json) AS arenas
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id`

const userToApi = (row: any) => {
    const arenas = (row.arenas ?? []) as { id: string; name: string }[]
    const roles = ['athlete', ...(arenas.length ? ['manager'] : []), ...(row.is_admin ? ['admin'] : [])]
    return {
        id: row.id,
        name: row.full_name || row.email,
        email: row.email,
        roles,
        status: row.status,
        arenas,
        createdAt: iso(row.created_at),
    }
}

export async function listUsers() {
    const result = await pool.query(`${USERS_SQL} ORDER BY u.created_at DESC`)
    return result.rows.map(userToApi)
}

async function getUser(userId: string) {
    const result = await pool.query(`${USERS_SQL} WHERE u.id = $1`, [userId])
    if (!result.rows[0]) throw new AdminError("Usuário não encontrado.", 404)
    return userToApi(result.rows[0])
}

export async function setUserStatus(actorId: string, userId: string, status: unknown) {
    if (status !== 'ativo' && status !== 'suspenso') throw new AdminError("Situação inválida.", 400)
    if (userId === actorId) throw new AdminError("Você não pode alterar a situação da sua própria conta.", 409)
    const target = await getUser(userId)
    if (status === 'suspenso' && target.roles.includes('admin')) {
        throw new AdminError("Administradores não podem ser suspensos por aqui. Remova o papel de admin antes (via SQL).", 409)
    }
    await pool.query('UPDATE public.profiles SET status = $2 WHERE id = $1', [userId, status])
    return getUser(userId)
}

export async function grantArena(actorId: string, userId: string, arenaId: number) {
    const target = await getUser(userId)
    if (target.status === 'suspenso') throw new AdminError("Reative a conta antes de vincular uma arena.", 409)
    const arena = await pool.query('SELECT id FROM public.arenas WHERE id = $1', [arenaId])
    if (!arena.rows[0]) throw new AdminError("Arena não encontrada.", 404)
    await pool.query(
        `INSERT INTO public.arena_managers (arena_id, user_id, granted_by) VALUES ($1, $2, $3)
         ON CONFLICT (arena_id, user_id) DO NOTHING`,
        [arenaId, userId, actorId]
    )
    return getUser(userId)
}

export async function revokeArena(userId: string, arenaId: number) {
    const result = await pool.query(
        'DELETE FROM public.arena_managers WHERE user_id = $1 AND arena_id = $2 RETURNING arena_id',
        [userId, arenaId]
    )
    if (!result.rows[0]) throw new AdminError("Este usuário não gerencia essa arena.", 404)
    return getUser(userId)
}

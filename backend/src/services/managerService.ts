import { pool } from '../config/database.js'
import { SPORTS } from './arenaRequestService.js'
import { completeExpired } from './reservationService.js'

// Produtos, vendas, campeonatos, publicações e indicadores do painel do gestor.
// Toda função recebe arenaId já autorizado por requireArenaManager; nada vem do corpo
// além dos campos de cada formulário. Os triggers do banco são a barreira final.

export class ManagerError extends Error {
    constructor(message: string, public status: 400 | 404 | 409 | 422) {
        super(message)
    }
}

export function parseId(value: unknown): number | null {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

const text = (b: Record<string, unknown>, key: string) => (typeof b[key] === 'string' ? (b[key] as string).trim() : '')
const optionalText = (b: Record<string, unknown>, key: string, max: number) => {
    if (b[key] === undefined || b[key] === null || b[key] === '') return { value: null as string | null }
    if (typeof b[key] !== 'string' || (b[key] as string).trim().length > max) return { error: true as const }
    return { value: (b[key] as string).trim() || null }
}
const money = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 99_999_999.99
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
const isDate = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const d = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}
const num = (value: unknown) => (value == null ? undefined : Number(value))
/** Coluna DATE como 'AAAA-MM-DD', venha como texto (parser do pg) ou como Date. */
const day = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10))
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : undefined)

/** Erros do PostgreSQL → respostas previsíveis, sem detalhes internos. */
function translate(error: unknown, duplicate: string): never {
    if (error instanceof ManagerError) throw error
    const e = error as { code?: string; message?: string; constraint?: string }
    if (e?.code === '23505') throw new ManagerError(duplicate, 409)
    if (e?.code === '23503') {
        if (e.constraint === 'sales_product_arena_fkey' && !e.message?.includes('não pertence')) {
            throw new ManagerError("Este produto tem vendas registradas e não pode ser excluído. Desative-o.", 409)
        }
        throw new ManagerError("Registro relacionado não encontrado nesta arena.", 404)
    }
    if (e?.code === '22003') throw new ManagerError("Valor fora do limite permitido.", 422)
    if (e?.code === '23514') {
        const m = e.message ?? ''
        if (m.includes('estoque insuficiente')) throw new ManagerError("Estoque insuficiente para esta venda.", 409)
        if (m.includes('produto inativo')) throw new ManagerError("Este produto está inativo.", 422)
        if (m.includes('inscrições encerradas')) throw new ManagerError("As inscrições deste campeonato estão encerradas.", 409)
        if (m.includes('limite de equipes')) throw new ManagerError("O campeonato já atingiu o limite de equipes.", 409)
        if (m.includes('não podem ser alteradas')) throw new ManagerError("Vendas não podem ser alteradas.", 409)
        throw new ManagerError("Dados inválidos.", 422)
    }
    throw error
}

// ── Produtos ────────────────────────────────────────────────────────────────
export const PRODUCT_CATEGORIES = ['bebida', 'alimento', 'equipamento', 'combo', 'servico', 'outro'] as const

export function validateProduct(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const name = text(b, 'name')
    if (name.length < 2 || name.length > 80) return { error: "Informe o nome do produto (2 a 80 caracteres)." }
    const category = b.category === undefined ? 'outro' : b.category
    if (typeof category !== 'string' || !(PRODUCT_CATEGORIES as readonly string[]).includes(category)) {
        return { error: "Categoria inválida." }
    }
    if (!money(b.price)) return { error: "Informe um preço válido (até 2 casas decimais)." }
    let stock: number | null = null
    if (b.stock !== undefined && b.stock !== null) {
        if (typeof b.stock !== 'number' || !Number.isInteger(b.stock) || b.stock < 0 || b.stock > 1_000_000) {
            return { error: "Estoque deve ser um número inteiro a partir de 0." }
        }
        stock = b.stock
    }
    const description = optionalText(b, 'description', 300)
    if ('error' in description) return { error: "Descrição inválida (até 300 caracteres)." }
    const active = b.active === undefined ? true : b.active
    if (typeof active !== 'boolean') return { error: "Situação inválida." }
    return { input: { name, category, price: b.price as number, stock, description: description.value, active } }
}

const productToApi = (row: any) => ({
    id: String(row.id),
    arenaId: String(row.arena_id),
    name: row.name,
    category: row.category,
    description: row.description ?? undefined,
    price: Number(row.price),
    stock: row.stock ?? undefined,
    active: row.active,
    soldQuantity: num(row.sold_quantity) ?? 0,
})

export async function listProducts(arenaId: number) {
    const result = await pool.query(
        `SELECT p.*, COALESCE((SELECT sum(quantity) FROM public.sales s WHERE s.product_id = p.id), 0) AS sold_quantity
         FROM public.products p WHERE p.arena_id = $1 ORDER BY p.active DESC, p.name`,
        [arenaId]
    )
    return result.rows.map(productToApi)
}

type ProductInput = NonNullable<ReturnType<typeof validateProduct>['input']>

export async function createProduct(arenaId: number, p: ProductInput) {
    try {
        const result = await pool.query(
            `INSERT INTO public.products (arena_id, name, category, description, price, stock, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [arenaId, p.name, p.category, p.description, p.price, p.stock, p.active]
        )
        return productToApi(result.rows[0])
    } catch (error) {
        translate(error, "Já existe um produto com esse nome nesta arena.")
    }
}

export async function updateProduct(arenaId: number, productId: number, p: ProductInput) {
    try {
        const result = await pool.query(
            `UPDATE public.products SET name = $3, category = $4, description = $5, price = $6, stock = $7, active = $8
             WHERE arena_id = $1 AND id = $2 RETURNING *`,
            [arenaId, productId, p.name, p.category, p.description, p.price, p.stock, p.active]
        )
        if (!result.rows[0]) throw new ManagerError("Produto não encontrado nesta arena.", 404)
        return productToApi(result.rows[0])
    } catch (error) {
        translate(error, "Já existe um produto com esse nome nesta arena.")
    }
}

export async function deleteProduct(arenaId: number, productId: number) {
    try {
        const result = await pool.query('DELETE FROM public.products WHERE arena_id = $1 AND id = $2 RETURNING id', [arenaId, productId])
        if (!result.rows[0]) throw new ManagerError("Produto não encontrado nesta arena.", 404)
    } catch (error) {
        translate(error, "Conflito ao excluir o produto.")
    }
}

// ── Vendas ──────────────────────────────────────────────────────────────────
export function validateSale(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const productId = parseId(b.productId)
    if (!productId) return { error: "Selecione o produto." }
    const quantity = b.quantity === undefined ? 1 : b.quantity
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
        return { error: "Quantidade deve ser de 1 a 999." }
    }
    let reservationId: number | null = null
    if (b.reservationId !== undefined && b.reservationId !== null && b.reservationId !== '') {
        reservationId = parseId(b.reservationId)
        if (!reservationId) return { error: "Reserva inválida." }
    }
    return { input: { productId, quantity, reservationId } }
}

const saleToApi = (row: any) => ({
    id: String(row.id),
    productId: String(row.product_id),
    productName: row.product_name,
    category: row.category,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    total: Number(row.total),
    reservationId: row.reservation_id != null ? String(row.reservation_id) : undefined,
    soldAt: iso(row.sold_at),
})

export async function listSales(arenaId: number, limit = 100) {
    const result = await pool.query(
        `SELECT s.*, p.name AS product_name, p.category FROM public.sales s
         JOIN public.products p ON p.id = s.product_id
         WHERE s.arena_id = $1 ORDER BY s.sold_at DESC LIMIT $2`,
        [arenaId, limit]
    )
    return result.rows.map(saleToApi)
}

export async function createSale(arenaId: number, userId: string, s: NonNullable<ReturnType<typeof validateSale>['input']>) {
    try {
        // unit_price e total são definidos pelo trigger a partir do produto.
        const inserted = await pool.query(
            `INSERT INTO public.sales (arena_id, product_id, reservation_id, quantity, unit_price, total, sold_by)
             VALUES ($1, $2, $3, $4, 0, 0, $5) RETURNING id`,
            [arenaId, s.productId, s.reservationId, s.quantity, userId]
        )
        const result = await pool.query(
            `SELECT s.*, p.name AS product_name, p.category FROM public.sales s
             JOIN public.products p ON p.id = s.product_id WHERE s.id = $1`,
            [inserted.rows[0].id]
        )
        return saleToApi(result.rows[0])
    } catch (error) {
        translate(error, "Venda duplicada.")
    }
}

export async function deleteSale(arenaId: number, saleId: number) {
    try {
        const result = await pool.query('DELETE FROM public.sales WHERE arena_id = $1 AND id = $2 RETURNING id', [arenaId, saleId])
        if (!result.rows[0]) throw new ManagerError("Venda não encontrada nesta arena.", 404)
    } catch (error) {
        translate(error, "Conflito ao estornar a venda.")
    }
}

// ── Campeonatos ─────────────────────────────────────────────────────────────
export const CHAMPIONSHIP_FORMATS = ['mata-mata', 'grupos-mata-mata', 'pontos-corridos'] as const
export const CHAMPIONSHIP_STATUSES = ['inscricoes', 'andamento', 'concluido'] as const

export function validateChampionship(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const name = text(b, 'name')
    if (name.length < 3 || name.length > 100) return { error: "Informe o nome do campeonato (3 a 100 caracteres)." }
    if (typeof b.sport !== 'string' || !(SPORTS as readonly string[]).includes(b.sport)) return { error: "Selecione a modalidade." }
    if (typeof b.format !== 'string' || !(CHAMPIONSHIP_FORMATS as readonly string[]).includes(b.format)) return { error: "Selecione o formato." }
    if (!isDate(b.startsOn)) return { error: "Informe a data de início." }
    let endsOn: string | null = null
    if (b.endsOn !== undefined && b.endsOn !== null && b.endsOn !== '') {
        if (!isDate(b.endsOn)) return { error: "Data de término inválida." }
        if (b.endsOn < b.startsOn) return { error: "O término não pode ser antes do início." }
        endsOn = b.endsOn
    }
    if (typeof b.maxTeams !== 'number' || !Number.isInteger(b.maxTeams) || b.maxTeams < 2 || b.maxTeams > 64) {
        return { error: "O limite de equipes deve ser de 2 a 64." }
    }
    let entryFee: number | null = null
    if (b.entryFee !== undefined && b.entryFee !== null) {
        if (!money(b.entryFee)) return { error: "Taxa de inscrição inválida." }
        entryFee = b.entryFee as number
    }
    const status = b.status === undefined ? 'inscricoes' : b.status
    if (typeof status !== 'string' || !(CHAMPIONSHIP_STATUSES as readonly string[]).includes(status)) return { error: "Situação inválida." }
    const description = optionalText(b, 'description', 500)
    if ('error' in description) return { error: "Descrição inválida (até 500 caracteres)." }
    return {
        input: { name, sport: b.sport, format: b.format, startsOn: b.startsOn, endsOn, maxTeams: b.maxTeams,
            entryFee, status, description: description.value },
    }
}

type ChampionshipInput = NonNullable<ReturnType<typeof validateChampionship>['input']>

const championshipToApi = (row: any, teams: any[] = []) => ({
    id: String(row.id),
    arenaId: String(row.arena_id),
    name: row.name,
    sport: row.sport,
    format: row.format,
    startsOn: day(row.starts_on),
    endsOn: row.ends_on ? day(row.ends_on) : undefined,
    maxTeams: row.max_teams,
    entryFee: num(row.entry_fee),
    status: row.status,
    description: row.description ?? undefined,
    teams: teams.map((t) => ({ id: String(t.id), name: t.name })),
})

export async function listChampionships(arenaId: number) {
    const champs = await pool.query('SELECT * FROM public.championships WHERE arena_id = $1 ORDER BY starts_on DESC', [arenaId])
    if (champs.rows.length === 0) return []
    const teams = await pool.query(
        'SELECT id, championship_id, name FROM public.championship_teams WHERE championship_id = ANY($1::bigint[]) ORDER BY created_at, id',
        [champs.rows.map((c) => c.id)]
    )
    return champs.rows.map((c) => championshipToApi(c, teams.rows.filter((t) => String(t.championship_id) === String(c.id))))
}

async function getChampionship(arenaId: number, id: number) {
    const all = await listChampionships(arenaId)
    const found = all.find((c) => c.id === String(id))
    if (!found) throw new ManagerError("Campeonato não encontrado nesta arena.", 404)
    return found
}

export async function createChampionship(arenaId: number, c: ChampionshipInput) {
    try {
        const result = await pool.query(
            `INSERT INTO public.championships (arena_id, name, sport, format, starts_on, ends_on, max_teams, entry_fee, status, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [arenaId, c.name, c.sport, c.format, c.startsOn, c.endsOn, c.maxTeams, c.entryFee, c.status, c.description]
        )
        return championshipToApi(result.rows[0])
    } catch (error) {
        translate(error, "Já existe um campeonato com esse nome nesta arena.")
    }
}

export async function updateChampionship(arenaId: number, id: number, c: ChampionshipInput) {
    try {
        const result = await pool.query(
            `UPDATE public.championships SET name = $3, sport = $4, format = $5, starts_on = $6, ends_on = $7,
                max_teams = $8, entry_fee = $9, status = $10, description = $11
             WHERE arena_id = $1 AND id = $2 RETURNING id`,
            [arenaId, id, c.name, c.sport, c.format, c.startsOn, c.endsOn, c.maxTeams, c.entryFee, c.status, c.description]
        )
        if (!result.rows[0]) throw new ManagerError("Campeonato não encontrado nesta arena.", 404)
        return getChampionship(arenaId, id)
    } catch (error) {
        translate(error, "Já existe um campeonato com esse nome nesta arena.")
    }
}

export async function deleteChampionship(arenaId: number, id: number) {
    const result = await pool.query('DELETE FROM public.championships WHERE arena_id = $1 AND id = $2 RETURNING id', [arenaId, id])
    if (!result.rows[0]) throw new ManagerError("Campeonato não encontrado nesta arena.", 404)
}

export async function addTeam(arenaId: number, championshipId: number, body: unknown) {
    const name = text((body ?? {}) as Record<string, unknown>, 'name')
    if (name.length < 2 || name.length > 60) throw new ManagerError("Informe o nome da equipe (2 a 60 caracteres).", 400)
    await getChampionship(arenaId, championshipId)
    try {
        await pool.query('INSERT INTO public.championship_teams (championship_id, name) VALUES ($1, $2)', [championshipId, name])
    } catch (error) {
        translate(error, "Já existe uma equipe com esse nome neste campeonato.")
    }
    return getChampionship(arenaId, championshipId)
}

export async function removeTeam(arenaId: number, championshipId: number, teamId: number) {
    await getChampionship(arenaId, championshipId)
    const result = await pool.query(
        'DELETE FROM public.championship_teams WHERE championship_id = $1 AND id = $2 RETURNING id',
        [championshipId, teamId]
    )
    if (!result.rows[0]) throw new ManagerError("Equipe não encontrada neste campeonato.", 404)
    return getChampionship(arenaId, championshipId)
}

// ── Publicações ─────────────────────────────────────────────────────────────
export const POST_KINDS = ['aviso', 'promocao', 'evento', 'resultado'] as const

const postToApi = (row: any) => ({
    id: String(row.id),
    arenaId: String(row.arena_id),
    kind: row.kind,
    content: row.content,
    authorName: row.author_name || undefined,
    createdAt: iso(row.created_at),
})

export async function listPosts(arenaId: number) {
    const result = await pool.query(
        `SELECT a.*, p.full_name AS author_name FROM public.arena_posts a
         LEFT JOIN public.profiles p ON p.id = a.author_id
         WHERE a.arena_id = $1 ORDER BY a.created_at DESC LIMIT 100`,
        [arenaId]
    )
    return result.rows.map(postToApi)
}

export async function createPost(arenaId: number, userId: string, body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const content = text(b, 'content')
    if (content.length < 1 || content.length > 1000) throw new ManagerError("Escreva a publicação (até 1000 caracteres).", 400)
    const kind = b.kind === undefined ? 'aviso' : b.kind
    if (typeof kind !== 'string' || !(POST_KINDS as readonly string[]).includes(kind)) throw new ManagerError("Tipo de publicação inválido.", 400)
    const inserted = await pool.query(
        'INSERT INTO public.arena_posts (arena_id, author_id, kind, content) VALUES ($1, $2, $3, $4) RETURNING id',
        [arenaId, userId, kind, content]
    )
    const result = await pool.query(
        `SELECT a.*, p.full_name AS author_name FROM public.arena_posts a
         LEFT JOIN public.profiles p ON p.id = a.author_id WHERE a.id = $1`,
        [inserted.rows[0].id]
    )
    return postToApi(result.rows[0])
}

export async function deletePost(arenaId: number, postId: number) {
    const result = await pool.query('DELETE FROM public.arena_posts WHERE arena_id = $1 AND id = $2 RETURNING id', [arenaId, postId])
    if (!result.rows[0]) throw new ManagerError("Publicação não encontrada nesta arena.", 404)
}

// ── Indicadores ─────────────────────────────────────────────────────────────
/** Horas reserváveis por quadra por dia (06:00–23:00, como a grade de horários). */
export const OPEN_HOURS_PER_DAY = 17

export async function getDashboard(arenaId: number, days: number) {
    await completeExpired({ arenaId })
    const today = `(now() AT TIME ZONE 'America/Sao_Paulo')::date`
    const window = `r.reservation_date BETWEEN ${today} - ($2::int - 1) AND ${today}`

    const [summary, courts, byDay, bySport, byCourt, salesSummary, salesByDay, topProducts, upcoming, champs, posts] = await Promise.all([
        pool.query(
            `SELECT
                count(*) FILTER (WHERE r.status IN ('confirmed', 'completed')) AS bookings,
                count(*) FILTER (WHERE r.status = 'cancelled') AS cancelled,
                COALESCE(sum(r.total_price) FILTER (WHERE r.status IN ('confirmed', 'completed')), 0) AS revenue,
                COALESCE(sum(EXTRACT(epoch FROM (r.end_time - r.start_time)) / 3600) FILTER (WHERE r.status IN ('confirmed', 'completed')), 0) AS hours,
                count(DISTINCT r.user_id) FILTER (WHERE r.status IN ('confirmed', 'completed')) AS customers
             FROM public.reservations r WHERE r.arena_id = $1 AND ${window}`,
            [arenaId, days]
        ),
        pool.query(`SELECT count(*) AS active FROM public.courts WHERE arena_id = $1 AND status = 'ativa'`, [arenaId]),
        pool.query(
            `SELECT d::date AS day,
                COALESCE((SELECT sum(r.total_price) FROM public.reservations r
                          WHERE r.arena_id = $1 AND r.reservation_date = d::date AND r.status IN ('confirmed', 'completed')), 0) AS revenue,
                COALESCE((SELECT count(*) FROM public.reservations r
                          WHERE r.arena_id = $1 AND r.reservation_date = d::date AND r.status IN ('confirmed', 'completed')), 0) AS bookings
             FROM generate_series(${today} - ($2::int - 1), ${today}, interval '1 day') AS d ORDER BY d`,
            [arenaId, days]
        ),
        pool.query(
            `SELECT r.sport, count(*) AS bookings, sum(r.total_price) AS revenue FROM public.reservations r
             WHERE r.arena_id = $1 AND ${window} AND r.status IN ('confirmed', 'completed')
             GROUP BY r.sport ORDER BY bookings DESC`,
            [arenaId, days]
        ),
        pool.query(
            `SELECT c.id, c.name,
                COALESCE(sum(EXTRACT(epoch FROM (r.end_time - r.start_time)) / 3600)
                    FILTER (WHERE r.status IN ('confirmed', 'completed')), 0) AS hours,
                COALESCE(sum(r.total_price) FILTER (WHERE r.status IN ('confirmed', 'completed')), 0) AS revenue
             FROM public.courts c
             LEFT JOIN public.reservations r ON r.court_id = c.id AND ${window}
             WHERE c.arena_id = $1 GROUP BY c.id, c.name ORDER BY hours DESC, c.name`,
            [arenaId, days]
        ),
        pool.query(
            `SELECT COALESCE(sum(total), 0) AS revenue, COALESCE(sum(quantity), 0) AS items, count(*) AS sales
             FROM public.sales WHERE arena_id = $1
               AND (sold_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${today} - ($2::int - 1) AND ${today}`,
            [arenaId, days]
        ),
        pool.query(
            `SELECT (sold_at AT TIME ZONE 'America/Sao_Paulo')::date AS day, sum(total) AS revenue FROM public.sales
             WHERE arena_id = $1 AND (sold_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${today} - ($2::int - 1) AND ${today}
             GROUP BY 1`,
            [arenaId, days]
        ),
        pool.query(
            `SELECT p.name, sum(s.quantity) AS quantity, sum(s.total) AS revenue FROM public.sales s
             JOIN public.products p ON p.id = s.product_id
             WHERE s.arena_id = $1 AND (s.sold_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${today} - ($2::int - 1) AND ${today}
             GROUP BY p.name ORDER BY revenue DESC LIMIT 5`,
            [arenaId, days]
        ),
        pool.query(
            `SELECT r.id, r.reservation_date, r.start_time, r.end_time, r.sport, c.name AS court_name,
                    p.full_name AS customer_name, p.phone AS customer_phone
             FROM public.reservations r
             JOIN public.courts c ON c.id = r.court_id
             LEFT JOIN public.profiles p ON p.id = r.user_id
             WHERE r.arena_id = $1 AND r.status = 'confirmed'
               AND private.reservation_instant(r.reservation_date, r.end_time) > now()
             ORDER BY r.reservation_date, r.start_time LIMIT 8`,
            [arenaId]
        ),
        pool.query(
            `SELECT count(*) FILTER (WHERE status <> 'concluido') AS active,
                    (SELECT count(*) FROM public.championship_teams t JOIN public.championships c2 ON c2.id = t.championship_id
                     WHERE c2.arena_id = $1 AND c2.status <> 'concluido') AS teams
             FROM public.championships WHERE arena_id = $1`,
            [arenaId]
        ),
        pool.query(`SELECT count(*) AS total FROM public.arena_posts WHERE arena_id = $1`, [arenaId]),
    ])

    const s = summary.rows[0]
    const activeCourts = Number(courts.rows[0].active)
    const hours = Number(s.hours)
    const capacity = activeCourts * OPEN_HOURS_PER_DAY * days
    const salesRevenueByDay = new Map(salesByDay.rows.map((row) => [day(row.day), Number(row.revenue)]))
    const reservationRevenue = Number(s.revenue)
    const salesRevenue = Number(salesSummary.rows[0].revenue)
    const bookings = Number(s.bookings)

    return {
        periodDays: days,
        reservations: {
            bookings,
            cancelled: Number(s.cancelled),
            revenue: reservationRevenue,
            averageTicket: bookings ? Math.round((reservationRevenue / bookings) * 100) / 100 : 0,
            hours,
            customers: Number(s.customers),
        },
        occupancy: { activeCourts, bookedHours: hours, availableHours: capacity, rate: capacity ? hours / capacity : 0 },
        sales: {
            revenue: salesRevenue,
            items: Number(salesSummary.rows[0].items),
            count: Number(salesSummary.rows[0].sales),
            topProducts: topProducts.rows.map((row) => ({ name: row.name, quantity: Number(row.quantity), revenue: Number(row.revenue) })),
        },
        totalRevenue: reservationRevenue + salesRevenue,
        daily: byDay.rows.map((row) => {
            const date = day(row.day)
            return { date, reservationRevenue: Number(row.revenue), salesRevenue: salesRevenueByDay.get(date) ?? 0, bookings: Number(row.bookings) }
        }),
        bySport: bySport.rows.map((row) => ({ sport: row.sport, bookings: Number(row.bookings), revenue: Number(row.revenue) })),
        byCourt: byCourt.rows.map((row) => ({
            courtId: String(row.id), name: row.name, hours: Number(row.hours), revenue: Number(row.revenue),
            occupancy: days ? Number(row.hours) / (OPEN_HOURS_PER_DAY * days) : 0,
        })),
        upcoming: upcoming.rows.map((row) => ({
            id: String(row.id),
            date: day(row.reservation_date),
            time: String(row.start_time).slice(0, 5),
            endTime: String(row.end_time).startsWith('24') ? '24:00' : String(row.end_time).slice(0, 5),
            sport: row.sport,
            courtName: row.court_name,
            customer: { name: row.customer_name || undefined, phone: row.customer_phone ?? undefined },
        })),
        championships: { active: Number(champs.rows[0]?.active ?? 0), teams: Number(champs.rows[0]?.teams ?? 0) },
        posts: Number(posts.rows[0].total),
    }
}
